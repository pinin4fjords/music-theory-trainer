import { describe, expect, it } from "vitest";
import {
  CURRICULUM_MANIFEST,
  CURRICULUM_TASK_FORMS,
  OPEN_ENDED_ALLOWLIST,
} from "./fixtures/curriculum-manifest.js";

const { content, objectives, rng } = globalThis.MTT;
const VALID_STATUSES = new Set(["implemented", "partial", "planned", "open"]);
const REVIEW_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function curriculumFamilies() {
  return content.grades.flatMap((grade) => grade.topics.flatMap((topic) =>
    (topic.objectives || []).map((definition) => ({ definition, grade: grade.grade, topic }))));
}

function allQuestionFamilies() {
  return content.grades.concat(content.auralGrades || []).flatMap((grade) =>
    grade.topics.flatMap((topic) => (topic.objectives || []).map((definition) => ({
      definition,
      grade: grade.grade,
      topic,
    }))));
}

function missingTaskForms(entry) {
  const implemented = new Set(entry.implementations.map((item) => item.taskForm));
  return entry.requiredTaskForms.filter((taskForm) => !implemented.has(taskForm));
}

describe("curriculum manifest - schema and provenance", () => {
  it("uses unique neutral IDs and complete audit metadata", () => {
    expect([...CURRICULUM_TASK_FORMS].sort()).toEqual([...objectives.TASK_KINDS].sort());
    const seen = new Set();
    for (const entry of CURRICULUM_MANIFEST) {
      expect(entry.id).toMatch(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
      expect(seen.has(entry.id), `duplicate curriculum objective ${entry.id}`).toBe(false);
      seen.add(entry.id);
      expect(entry.stage).toBeGreaterThanOrEqual(1);
      expect(entry.stage).toBeLessThanOrEqual(8);
      expect(objectives.STRANDS).toContain(entry.strand);
      expect(entry.objective.trim().length).toBeGreaterThan(0);
      expect(entry.requiredTaskForms.length).toBeGreaterThan(0);
      expect(new Set(entry.requiredTaskForms).size).toBe(entry.requiredTaskForms.length);
      entry.requiredTaskForms.forEach((taskForm) => expect(CURRICULUM_TASK_FORMS).toContain(taskForm));
      expect(VALID_STATUSES.has(entry.status)).toBe(true);
      expect(entry.sourceReference).toMatch(/^written-theory-specification:stage-[1-8]$/);
      expect(entry.lastReviewed).toMatch(REVIEW_DATE_PATTERN);
      expect(Number.isNaN(Date.parse(`${entry.lastReviewed}T00:00:00Z`))).toBe(false);
      if (entry.status !== "implemented") expect(entry.trackingIssue).toBeGreaterThan(0);
    }
  });

  it("contains valid, acyclic prerequisite links", () => {
    const byId = new Map(CURRICULUM_MANIFEST.map((entry) => [entry.id, entry]));
    for (const entry of CURRICULUM_MANIFEST) {
      expect(new Set(entry.prerequisiteIds).size).toBe(entry.prerequisiteIds.length);
      for (const prerequisiteId of entry.prerequisiteIds) {
        const prerequisite = byId.get(prerequisiteId);
        expect(prerequisite, `${entry.id} has unknown prerequisite ${prerequisiteId}`).toBeTruthy();
        expect(prerequisiteId).not.toBe(entry.id);
        expect(prerequisite.stage).toBeLessThanOrEqual(entry.stage);
      }
    }

    const visiting = new Set();
    const visited = new Set();
    function visit(id) {
      if (visiting.has(id)) throw new Error(`curriculum prerequisite cycle at ${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      byId.get(id).prerequisiteIds.forEach(visit);
      visiting.delete(id);
      visited.add(id);
    }
    CURRICULUM_MANIFEST.forEach((entry) => visit(entry.id));
  });
});

describe("curriculum manifest - implementation coverage", () => {
  it("maps every written-theory question family exactly once at the correct stage", () => {
    const actual = curriculumFamilies();
    const actualById = new Map();
    for (const item of actual) {
      expect(actualById.has(item.definition.id), `duplicate question family ${item.definition.id}`).toBe(false);
      actualById.set(item.definition.id, item);
    }

    const mappedIds = new Set();
    for (const entry of CURRICULUM_MANIFEST) {
      for (const implementation of entry.implementations) {
        const actualFamily = actualById.get(implementation.objectiveId);
        expect(actualFamily, `${entry.id} maps unknown family ${implementation.objectiveId}`).toBeTruthy();
        expect(mappedIds.has(implementation.objectiveId), `family mapped twice: ${implementation.objectiveId}`).toBe(false);
        mappedIds.add(implementation.objectiveId);
        expect(actualFamily.grade).toBe(entry.stage);
        expect(actualFamily.definition.difficulty).toBe(entry.stage);
        expect(actualFamily.definition.strand).toBe(entry.strand);
        expect(actualFamily.definition.taskKind).toBe(implementation.taskForm);

        const question = actualFamily.topic.questions.forObjective(
          implementation.objectiveId,
          rng.create(`manifest-${implementation.objectiveId}`),
        );
        expect(question.meta.objectiveId).toBe(implementation.objectiveId);
        expect(question.meta.taskKind).toBe(implementation.taskForm);
      }
    }

    expect([...actualById.keys()].filter((id) => !mappedIds.has(id))).toEqual([]);
  });

  it("keeps status aligned with implemented and missing task forms", () => {
    for (const entry of CURRICULUM_MANIFEST) {
      const missing = missingTaskForms(entry);
      if (entry.status === "implemented") expect(missing, entry.id).toEqual([]);
      if (entry.status === "partial") {
        expect(entry.implementations.length, entry.id).toBeGreaterThan(0);
        expect(missing.length, entry.id).toBeGreaterThan(0);
      }
      if (entry.status === "planned" || entry.status === "open") {
        expect(entry.implementations, entry.id).toEqual([]);
        expect(missing.length, entry.id).toBe(entry.requiredTaskForms.length);
      }
    }
  });

  it("allows only the named open-ended objectives to remain unimplemented", () => {
    const open = CURRICULUM_MANIFEST.filter((entry) => entry.status === "open").map((entry) => entry.id);
    expect(open).toEqual(OPEN_ENDED_ALLOWLIST);
    for (const id of OPEN_ENDED_ALLOWLIST) {
      const entry = CURRICULUM_MANIFEST.find((candidate) => candidate.id === id);
      expect(entry, `unknown open-ended objective ${id}`).toBeTruthy();
      expect(entry.status).toBe("open");
      expect(entry.trackingIssue).toBeGreaterThan(0);
    }
  });

  it("represents the four gaps from the previous topic-level audit", () => {
    const expected = [
      "notation.ledger-lines.g2",
      "notation.ledger-lines.g3",
      "notation.clef-transposition.g4",
      "terminology.instruments.g4",
    ];
    for (const id of expected) {
      const entry = CURRICULUM_MANIFEST.find((candidate) => candidate.id === id);
      expect(entry, id).toBeTruthy();
      expect(entry.status).toBe("planned");
      expect(entry.implementations).toEqual([]);
    }
  });

  it("reports intentional task-form gaps", () => {
    const gaps = CURRICULUM_MANIFEST.map((entry) => ({
      entry,
      taskForms: missingTaskForms(entry),
    })).filter((gap) => gap.taskForms.length);
    const taskFormCount = gaps.reduce((sum, gap) => sum + gap.taskForms.length, 0);
    const report = gaps.map((gap) =>
      `G${gap.entry.stage} ${gap.entry.id}: ${gap.taskForms.join(", ")} (${gap.entry.status}, #${gap.entry.trackingIssue})`).join("\n");
    console.log(`Intentional curriculum gaps (${gaps.length} objectives, ${taskFormCount} task forms):\n${report}`);
    expect(gaps.length).toBeGreaterThan(0);
  });
});

describe("question-family task forms", () => {
  it("declares a valid task form on every theory and aural family", () => {
    for (const { definition, topic } of allQuestionFamilies()) {
      expect(objectives.TASK_KINDS).toContain(definition.taskKind);
      const question = topic.questions.forObjective(
        definition.id,
        rng.create(`task-form-${topic.id}-${definition.id}`),
      );
      expect(question.meta.objectiveId).toBe(definition.id);
      expect(question.meta.taskKind).toBe(definition.taskKind);
    }
  });
});
