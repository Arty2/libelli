#!/usr/bin/env bash
#
# Project rules that a linter can't enforce, checked in CI before anything else
# runs — see AGENTS.md § Rules that execute. Extend this file rather than
# writing the next rule as a paragraph: a rule that only lives in prose gets
# broken by the first change that doesn't re-read it, including by whoever
# wrote the rule.
#
# Every search is scoped to src/ — never to scripts/ — because this file
# necessarily contains the strings it looks for.
#
# Every run also appends one line to .claude/logs/gates.jsonl: which checks
# passed or failed, when, on which commit. That file is gitignored and never
# leaves this machine. See AGENTS.md for what it is for.

set -uo pipefail

cd "$(dirname "$0")/.."

status=0
checks=()

fail() {
	status=1
	checks+=("{\"name\":\"$3\",\"pass\":false}")
	printf '  FAIL  %s\n' "$1"
	printf '%s\n' "$2" | sed 's/^/        /'
}

pass() {
	checks+=("{\"name\":\"$2\",\"pass\":true}")
	printf '    ok  %s\n' "$1"
}

# ── 1. No route from a string to markup or script ────────────────────────────
# Cell content is untrusted and Svelte escapes interpolated text by default.
# Nothing here should ever need to step around that, and `{@html}` — the one
# construct that does — is gated separately below rather than banned, because
# three renderers legitimately produce markup.
sinks=$(grep -rnF \
	-e 'innerHTML' \
	-e 'outerHTML' \
	-e 'insertAdjacentHTML' \
	-e 'eval(' \
	-e 'new Function(' \
	-e 'document.write' \
	src 2>/dev/null)

if [ -n "$sinks" ]; then
	fail "markup or script sink in src/" "$sinks" "no-injection-sinks"
else
	pass "no markup or script sinks in src/" "no-injection-sinks"
fi

# ── 2. {@html} stays in the files that earn it ───────────────────────────────
# Card and PrintRoot render Markdown, QR and hand-drawn SVG that have already
# been through markdown.ts, qr.ts, hand.ts or css.ts; Icon inlines a path from
# icons.ts, which is ours. Every one of those is a chokepoint with tests
# asserting the renderer *routes* through it. A fourth file is a new chokepoint
# and a deliberate decision — add it here in the commit that makes it.
html_allowed='src/lib/components/Card.svelte src/lib/components/Icon.svelte src/lib/components/PrintRoot.svelte'
html_users=$(grep -rlF '{@html' src 2>/dev/null | sort)
html_extra=""
for file in $html_users; do
	case " $html_allowed " in
	*" $file "*) ;;
	*) html_extra="$html_extra $file" ;;
	esac
done

if [ -n "$html_extra" ]; then
	fail "{@html} outside the allow-listed renderers" \
		"$(echo "$html_extra" | xargs)
route it through markdown.ts / css.ts / qr.ts / hand.ts, or add the file here on purpose" \
		"html-blocks-allowlisted"
else
	pass "{@html} only in the three allow-listed renderers" "html-blocks-allowlisted"
fi

# ── 3. No new fetch outside the two files that have one ─────────────────────
# png.ts inlines a web font and the card's own pictures for export; the service
# worker is a cache. Anywhere else, a fetch is the rule breaking.
#
# Named for what it checks, which is narrower than "the app fetches nothing".
# It sees `fetch` and `XMLHttpRequest` and nothing else: fonts.ts reaches Google
# by appending a <link>, and a template may name an http(s) background that
# becomes an <img> — both are requests this grep cannot see, and both are
# deliberate. What guards those is `safeFamily` and `safeImageUrl` restricting
# what a template can name, not this gate. A gate that claimed to cover them
# would be the more dangerous thing, because nobody would look again.
net=$(grep -rnE '\bfetch\(|XMLHttpRequest|importScripts\(' src 2>/dev/null |
	grep -v '^src/lib/png\.ts:' |
	grep -v '^src/service-worker\.ts:')

if [ -n "$net" ]; then
	fail "fetch outside png.ts and the service worker" "$net" "no-unlisted-fetch"
else
	pass "no fetch outside png.ts and the service worker" "no-unlisted-fetch"
fi

# ── 4. No runtime dependencies ───────────────────────────────────────────────
# The Markdown renderer, the CSV parser and the QR encoder are hand-written so
# the app works offline and nothing can rot underneath it. jsqr and the
# toolchain are dev dependencies; a `dependencies` block means something now
# ships to the browser that nobody here maintains.
runtime_deps=$(node -e 'const d=require("./package.json").dependencies||{};console.log(Object.keys(d).join(" "))' 2>/dev/null)

if [ -n "$runtime_deps" ]; then
	fail "package.json has runtime dependencies" \
		"$runtime_deps
this app ships none — see AGENTS.md § No runtime dependencies" \
		"no-runtime-dependencies"
else
	pass "no runtime dependencies" "no-runtime-dependencies"
fi

# ── 5. The security headers are still in vercel.json ────────────────────────
# A generic edit to vercel.json — a redirect, a rewrite, a cache rule — is an
# easy place to lose the headers block entirely rather than extend it, and
# nothing else would notice: the app looks identical without them.
#
# Content-Security-Policy is in the list because it is the only copy that
# matters for framing. This app ships no CSP of its own; that header carries
# `frame-ancestors 'none'` and nothing else, which is X-Frame-Options in the
# spelling browsers now honour. Lose it and X-Frame-Options is doing the whole
# job alone. See docs/decisions.md § vercel.json.
required_headers='Strict-Transport-Security X-Content-Type-Options Referrer-Policy X-Frame-Options Content-Security-Policy Permissions-Policy'
missing=""
for header in $required_headers; do
	grep -q "\"$header\"" vercel.json 2>/dev/null || missing="$missing $header"
done

if [ -n "$missing" ]; then
	fail "vercel.json is missing security headers" "$(echo "$missing" | xargs)" "security-headers-present"
else
	pass "security headers present in vercel.json" "security-headers-present"
fi

# ── 6. colour is spelled color where it is a name ────────────────────────────
# Identifier, CSS property, custom property. Prose keeps its `u` — a comment
# about a coloured glyph is a sentence, not a name — so this matches only the
# positions where the word is naming the thing. See AGENTS.md § How we work.
#
# The `?` is not decoration and the pattern is deliberately not anchored to a
# word boundary. Both were wrong when this was written: requiring a non-letter
# before `colour` meant `fillColour:` did not match, and no optional `?` meant
# `borderColour?: string` did not either — which is to say it matched none of
# the ways anyone would actually introduce the mistake. It passed green
# guarding nothing. A gate that cannot fail is worth less than no gate,
# because it also stops anyone looking.
colour=$(grep -rnE '[Cc]olour[A-Za-z0-9_]*[[:space:]]*\??[[:space:]]*[:=(]' src 2>/dev/null)

if [ -n "$colour" ]; then
	fail "colour spelled with a u where it names something" "$colour" "color-not-colour"
else
	pass "color spelled color wherever it is a name" "color-not-colour"
fi

# ── 7. VERSION and package.json agree ────────────────────────────────────────
# Two files hold the number and the help panel reads only one of them, so a
# session that bumps package.json alone ships a build that misreports itself —
# invisible until someone is trying to work out which version a bug is in.
pkg_version=$(node -e 'console.log(require("./package.json").version)' 2>/dev/null)
src_version=$(sed -n "s/^export const VERSION = '\(.*\)';$/\1/p" src/lib/version.ts 2>/dev/null)

if [ -z "$pkg_version" ] || [ -z "$src_version" ]; then
	fail "could not read the version from both places" \
		"package.json='$pkg_version' src/lib/version.ts='$src_version'" \
		"version-in-step"
elif [ "$pkg_version" != "$src_version" ]; then
	fail "version.ts and package.json disagree" \
		"src/lib/version.ts says $src_version, package.json says $pkg_version" \
		"version-in-step"
else
	pass "version $src_version in both places" "version-in-step"
fi

# ── 8. The instructions file stays short ─────────────────────────────────────
# AGENTS.md is read in full every session, and its own opening paragraph asks
# for brevity. That request is worth nothing while the only thing enforcing it
# is the sentence making it — so it is a budget: raise it deliberately, in the
# commit that earns it, or move the detail into docs/decisions.md where nobody
# pays for it per turn.
#
# Overridable so the failure path is testable without editing this file:
# `AGENTS_MAX=10 npm run gates` should fail.
AGENTS_MAX="${AGENTS_MAX:-250}"

# Counted only if the file can actually be read. A gate that passes when it
# couldn't do its job is worse than no gate.
if [ -r AGENTS.md ]; then
	agents_lines=$(wc -l <AGENTS.md | tr -d ' ')
	if [ "$agents_lines" -gt "$AGENTS_MAX" ]; then
		fail "AGENTS.md is $agents_lines lines (budget $AGENTS_MAX)" \
			"move detail into docs/decisions.md, or raise AGENTS_MAX on purpose" \
			"instructions-file-budget"
	else
		pass "AGENTS.md is $agents_lines lines (budget $AGENTS_MAX)" "instructions-file-budget"
	fi
else
	fail "AGENTS.md is missing or unreadable" \
		"the instructions file is the one thing this project cannot work without" \
		"instructions-file-budget"
fi

# ── 9. The interface's type is in rem ────────────────────────────────────────
# A zoom does not magnify the app; it sets the root font size (textsize.ts),
# and only type written in `rem` follows it. One label left in `px` stays small
# while everything round it grows — the one field nobody at 150% can read. The
# card's type is in `pt`, set from the template, and is not what this is about.
# Matches a `font:` shorthand or a `font-size:` whose size is a pixel length;
# `font: inherit` and a pixel line-height after the slash are left alone. A
# size that must not grow says so on its own line with `/* fixed type */`, and
# its comment above says why — the full-size cell editor is the one.
pxtype=$(grep -rnE --include='*.svelte' --include='*.css' \
	'font(-size)?[[:space:]]*:[^;/]*[^-a-z0-9.][0-9.]+px' src 2>/dev/null |
	grep -vF '/* fixed type */')

if [ -n "$pxtype" ]; then
	fail "interface type sized in px — write it in rem, 16px to the rem" "$pxtype" "type-in-rem"
else
	pass "interface type sized in rem" "type-in-rem"
fi

# ── 10. Every version says what changed ──────────────────────────────────────
# CHANGELOG.md is what a person reads under What's new, and a list that stops a
# few versions back reads as a list of everything. So the top release heading
# has to be the version being shipped: a bump, patch or minor, is not done
# until the changelog says what it brought. A patch rewrites its minor's
# heading rather than adding one — the file keeps one section per minor.
# The same shape changelog.ts lists — a version, a dash, an ISO date — so a
# heading this accepts is never one the What's new dialog silently skips.
top_release=$(sed -n 's/^## \([0-9]*\.[0-9]*\.[0-9]*\) .* \([0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}\)[[:space:]]*$/\1/p' CHANGELOG.md 2>/dev/null | head -n 1)

heading="## $src_version — $(date -u +%Y-%m-%d)"
if [ "$top_release" != "$src_version" ]; then
	# Say which of the two it is: a patch keeps its minor's section, so the
	# fix is to rename that heading, and only a new minor starts one.
	if [ "${top_release%.*}" = "${src_version%.*}" ]; then
		todo="rewrite '## $top_release' as '$heading' and add this patch's lines under it"
	else
		todo="start a section headed '$heading' above it"
	fi
	fail "CHANGELOG.md does not open with version $src_version" \
		"its top release heading is '${top_release:-none}' — $todo" \
		"changelog-current"
else
	pass "CHANGELOG.md opens with $src_version" "changelog-current"
fi

# ── 11. A version says what it brought, briefly ──────────────────────────────
# What's new is read in a dialog on a phone by somebody who has just updated,
# and it is the one thing here written for them rather than for us. A section
# that runs to a screenful is a release note nobody finishes, and it grows the
# same way AGENTS.md does: every line individually defensible. So it is a
# budget of lines that say something — blank ones are not counted, because
# wrapping is the writer's business and the reading is not. A line is a group
# of related changes rather than one change, so a feature and the five switches
# that came with it are one line. Three is the usual shape; six is the most a
# release has ever needed. Say what changed and what it means, and leave how it
# works to the README.
#
# Overridable so the failure path is testable: `CHANGELOG_MAX=2 npm run gates`
# should fail.
CHANGELOG_MAX="${CHANGELOG_MAX:-6}"

if [ -r CHANGELOG.md ]; then
	long=$(awk -v max="$CHANGELOG_MAX" '
		/^## / {
			if (name != "" && len > max) printf "%s — %d lines\n", name, len
			name = $0
			len = 0
			next
		}
		name != "" && $0 != "" { len++ }
		END { if (name != "" && len > max) printf "%s — %d lines\n", name, len }
	' CHANGELOG.md)
	if [ -n "$long" ]; then
		fail "a CHANGELOG.md section is over $CHANGELOG_MAX lines" \
			"$long
cut it to what a user needs to know, or raise CHANGELOG_MAX on purpose" \
			"changelog-section-budget"
	else
		pass "every CHANGELOG.md section is $CHANGELOG_MAX lines or fewer" "changelog-section-budget"
	fi
else
	fail "CHANGELOG.md is missing or unreadable" \
		"the release it heads is what the app shows under What's new" \
		"changelog-section-budget"
fi

# ── 12. A release's lines are plain text ────────────────────────────────────
# The What's new dialog parses this file rather than rendering it — raw markup
# stays in the three renderers that earn it (§ 2) — and reads plain text with
# `code` spans and nothing else. So a `**bold**` written here is shown with its
# asterisks to everybody who opens the dialog, which is the one audience the
# file has. Bullets only: the preamble above the first release is for whoever
# opens the file, and never reaches the dialog.
markup=$(awk '
	/^## [0-9]/ { release = 1; next }
	/^## / { release = 0; next }
	release && /^- / && (/\*\*/ || /\[[^]]*\]\(/ || /^- #/) { printf "%d: %s\n", NR, $0 }
' CHANGELOG.md 2>/dev/null)

if [ -n "$markup" ]; then
	fail "CHANGELOG.md markup the What's new dialog cannot read" \
		"$markup
it shows as typed — plain text and \`code\` spans are all that dialog reads" \
		"changelog-plain-text"
else
	pass "CHANGELOG.md entries are plain text and code spans" "changelog-plain-text"
fi

# ── local, gitignored log — see the header comment ───────────────────────────
mkdir -p .claude/logs
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
sha=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)
joined=$(
	IFS=,
	echo "${checks[*]}"
)
overall=$([ "$status" -eq 0 ] && echo pass || echo fail)
printf '{"ts":"%s","sha":"%s","status":"%s","checks":[%s]}\n' "$ts" "$sha" "$overall" "$joined" \
	>>.claude/logs/gates.jsonl

if [ "$status" -ne 0 ]; then
	printf '\ngates failed\n'
fi

exit "$status"
