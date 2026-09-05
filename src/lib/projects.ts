import { autoMap, usedSlots } from './template';
import { sampleDataset, starterTemplate } from './onboarding';
import {
	KEY_DATASET,
	KEY_TEMPLATE,
	STORE_KV,
	idbDelete,
	idbGet,
	idbSet,
	loadDataset,
	loadMapping,
	loadTemplate,
	local
} from './storage';
import type { Dataset, Mapping, Template } from './types';

/**
 * Projects: several working sets in one browser, so an import lands in its own
 * place instead of on top of the last job.
 *
 * A project is its template, its rows and the mapping between them — the three
 * things that only make sense together. Fonts stay browser-global: they are
 * assets of the machine, not of a job, and a template that names a missing one
 * still prompts for the file.
 *
 * The index is one small record listing what exists; each project's contents
 * live under their own key, so switching projects reads one project rather than
 * everything ever made.
 */

export interface ProjectMeta {
	id: string;
	name: string;
	createdAt: number;
	updatedAt: number;
}

export interface ProjectData {
	template: Template;
	dataset: Dataset;
	mapping: Mapping;
	activeRow: number;
}

const KEY_INDEX = 'projects:index';
const KEY_ACTIVE = 'project:active';
const dataKey = (id: string) => `project:${id}`;

export const newProjectId = () =>
	`p_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// ---- pure index operations (unit-tested; the storage below just persists them)

export function uniqueName(index: ProjectMeta[], wanted: string): string {
	const base = wanted.trim() || 'Untitled project';
	if (!index.some((p) => p.name === base)) return base;
	for (let n = 2; ; n++) {
		const candidate = `${base} ${n}`;
		if (!index.some((p) => p.name === candidate)) return candidate;
	}
}

export function addToIndex(index: ProjectMeta[], meta: ProjectMeta): ProjectMeta[] {
	return [...index, { ...meta, name: uniqueName(index, meta.name) }];
}

export function renameInIndex(index: ProjectMeta[], id: string, name: string): ProjectMeta[] {
	const others = index.filter((p) => p.id !== id);
	return index.map((p) => (p.id === id ? { ...p, name: uniqueName(others, name), updatedAt: Date.now() } : p));
}

export function removeFromIndex(index: ProjectMeta[], id: string): ProjectMeta[] {
	return index.filter((p) => p.id !== id);
}

export function touchInIndex(index: ProjectMeta[], id: string, at = Date.now()): ProjectMeta[] {
	return index.map((p) => (p.id === id ? { ...p, updatedAt: at } : p));
}

/** Which project to open when the remembered one is gone or was never set. */
export function chooseActive(index: ProjectMeta[], remembered: string | null): string | null {
	if (remembered && index.some((p) => p.id === remembered)) return remembered;
	return index.length ? [...index].sort((a, b) => b.updatedAt - a.updatedAt)[0].id : null;
}

// ---- storage ---------------------------------------------------------------

export const listProjects = async (): Promise<ProjectMeta[]> =>
	(await idbGet<ProjectMeta[]>(STORE_KV, KEY_INDEX)) ?? [];

export const saveIndex = (index: ProjectMeta[]) => idbSet(STORE_KV, KEY_INDEX, index);

export const rememberedProject = () => local.get<string | null>(KEY_ACTIVE, null);
export const rememberProject = (id: string | null) => local.set(KEY_ACTIVE, id);

export const loadProjectData = (id: string) => idbGet<ProjectData>(STORE_KV, dataKey(id));
export const saveProjectData = (id: string, data: ProjectData) => idbSet(STORE_KV, dataKey(id), data);
export const deleteProjectData = (id: string) => idbDelete(STORE_KV, dataKey(id));

export function blankProjectData(): ProjectData {
	const template = starterTemplate();
	const dataset = sampleDataset();
	return { template, dataset, mapping: autoMap(usedSlots(template), dataset.columns), activeRow: 0 };
}

export async function createProject(name: string, data: ProjectData): Promise<ProjectMeta> {
	const index = await listProjects();
	const now = Date.now();
	const meta: ProjectMeta = { id: newProjectId(), name, createdAt: now, updatedAt: now };
	const next = addToIndex(index, meta);
	await saveIndex(next);
	await saveProjectData(meta.id, data);
	// addToIndex may have made the name unique, so return what was actually stored.
	return next[next.length - 1];
}

export async function deleteProject(id: string): Promise<ProjectMeta[]> {
	const next = removeFromIndex(await listProjects(), id);
	await saveIndex(next);
	await deleteProjectData(id);
	return next;
}

/**
 * Carry a single-project browser — everything before projects existed — into
 * its first project, then drop the old keys. Runs once: afterwards the index is
 * non-empty and this does nothing.
 */
export async function migrateToProjects(): Promise<ProjectMeta[]> {
	const index = await listProjects();
	if (index.length) return index;

	const template = await loadTemplate();
	const dataset = await loadDataset();
	if (!template && !dataset?.columns?.length) return index;

	const carried: ProjectData = {
		template: template ?? starterTemplate(),
		dataset: dataset?.columns?.length ? dataset : { columns: [], rows: [] },
		mapping: template ? loadMapping(template.name) : {},
		activeRow: 0
	};
	const meta = await createProject(carried.template.name || 'My cards', carried);
	await idbDelete(STORE_KV, KEY_TEMPLATE);
	await idbDelete(STORE_KV, KEY_DATASET);
	return [meta];
}
