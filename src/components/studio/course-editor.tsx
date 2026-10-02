"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Eye, Loader2, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { Alert, Chip, Field, Input, Select, Textarea } from "@/components/ui";
import { ItemIcon } from "@/components/course/item-icon";
import { UploadButton } from "./upload-button";
import { useAction } from "./use-action";
import {
  addItem,
  addSection,
  deleteCourse,
  deleteItem,
  deleteSection,
  moveItem,
  moveSection,
  setCourseStatus,
  updateCourse,
  updateItem,
  updateSection,
} from "@/app/(app)/studio/actions";
import type { Course, ItemKind, SectionWithItems } from "@/lib/types";

export function CourseDetailsForm({ course }: { course: Course }) {
  const { run, pending, error } = useAction();
  const [cover, setCover] = useState(course.cover_image_url ?? "");
  const [isFree, setIsFree] = useState(course.is_free);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  return (
    <form
      className="card-brut space-y-5 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setSaved(false);
        run(() => updateCourse(course.id, fd), {
          onSuccess: () => {
            setSaved(true);
            if (fd.get("slug") !== course.slug) router.refresh();
          },
        });
      }}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Title" htmlFor="title">
          <Input id="title" name="title" defaultValue={course.title} required maxLength={160} />
        </Field>
        <Field label="Slug (URL)" htmlFor="slug" hint={`/courses/${course.slug}`}>
          <Input id="slug" name="slug" defaultValue={course.slug} required pattern="[a-z0-9]+(-[a-z0-9]+)*" className="font-mono" />
        </Field>
      </div>
      <Field label="Subtitle" htmlFor="subtitle">
        <Input id="subtitle" name="subtitle" defaultValue={course.subtitle ?? ""} maxLength={300} />
      </Field>
      <Field label="Description (Markdown)" htmlFor="description">
        <Textarea id="description" name="description" defaultValue={course.description ?? ""} rows={7} className="font-mono text-[13px]" />
      </Field>
      <div className="grid gap-5 md:grid-cols-3">
        <Field label="Level" htmlFor="level">
          <Select id="level" name="level" defaultValue={course.level}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </Select>
        </Field>
        <Field label="Estimated hours" htmlFor="estimated_hours">
          <Input id="estimated_hours" name="estimated_hours" type="number" step="0.5" min="0" defaultValue={course.estimated_hours ?? ""} />
        </Field>
        <div className="space-y-2">
          <span className="label-brut">Pricing</span>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="is_free" checked={isFree} onChange={(e) => setIsFree(e.target.checked)} className="size-4 accent-[#1B1F3B]" /> Free course
          </label>
          {!isFree && <Input name="price_rupees" type="number" min="0" step="1" placeholder="Price in ₹" defaultValue={course.price_paise ? course.price_paise / 100 : ""} />}
        </div>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. linux, git">
          <Input id="tags" name="tags" defaultValue={course.tags.join(", ")} />
        </Field>
        <Field label="Skills" htmlFor="skills" hint="Shown on certificates, e.g. Git, Bash">
          <Input id="skills" name="skills" defaultValue={course.skills.join(", ")} />
        </Field>
      </div>
      <div className="space-y-2">
        <span className="label-brut">Cover image</span>
        <div className="flex flex-wrap items-center gap-4">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-20 w-36 rounded-xl border-[3px] border-ink object-cover" />
          ) : (
            <div className="grid h-20 w-36 place-items-center rounded-xl border-[3px] border-dashed border-ink/40 text-xs text-ink/50">No cover</div>
          )}
          <UploadButton accept="image/*" label="Upload cover" onUploaded={(f) => f.url && setCover(f.url)} />
          {cover && (
            <button type="button" className="text-sm font-semibold underline" onClick={() => setCover("")}>Remove</button>
          )}
        </div>
        <input type="hidden" name="cover_image_url" value={cover} />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <div className="flex items-center justify-end gap-3">
        {saved && !pending && <span className="text-sm font-semibold">Saved ✓</span>}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save details
        </button>
      </div>
    </form>
  );
}

export function CourseStatusBar({ course }: { course: Course }) {
  const { run, pending, error } = useAction();
  const router = useRouter();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={course.status === "published" ? "mint" : course.status === "draft" ? "yellow" : "sunk"}>{course.status}</Chip>
        <Link href={`/courses/${course.slug}`} className="btn btn-ghost btn-sm" target="_blank">
          <Eye className="size-4" /> Preview <ExternalLink className="size-3" />
        </Link>
        {course.status !== "published" && (
          <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(() => setCourseStatus(course.id, "published"))}>
            Publish
          </button>
        )}
        {course.status === "published" && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => run(() => setCourseStatus(course.id, "draft"))}>
            Unpublish
          </button>
        )}
        {course.status !== "archived" && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => setCourseStatus(course.id, "archived"))}>
            Archive
          </button>
        )}
        {course.status !== "published" && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={pending}
            onClick={() => {
              if (confirm(`Delete “${course.title}” and all its sections, items and learner progress? This cannot be undone.`)) {
                run(() => deleteCourse(course.id), { onSuccess: () => router.push("/studio/courses"), refresh: false });
              }
            }}
          >
            <Trash2 className="size-4" /> Delete
          </button>
        )}
        {pending && <Loader2 className="size-4 animate-spin" />}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  );
}

export function OutlineEditor({ courseId, outline, labTitles }: { courseId: string; outline: SectionWithItems[]; labTitles: Record<string, { title: string; runtime: "terminal" | "compile" }> }) {
  const { run, pending, error } = useAction();
  const [newSection, setNewSection] = useState("");

  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}
      {outline.map((section, si) => (
        <SectionCard key={section.id} section={section} index={si} total={outline.length} run={run} pending={pending} labTitles={labTitles} sections={outline} />
      ))}
      <form
        className="flex gap-3 rounded-3xl border-4 border-dashed border-ink/40 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addSection(courseId, newSection), { onSuccess: () => setNewSection("") });
        }}
      >
        <input className="input-brut input-sm" placeholder="New section title" value={newSection} onChange={(e) => setNewSection(e.target.value)} aria-label="New section title" />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
          <Plus className="size-4" /> Add section
        </button>
      </form>
    </div>
  );
}

type Run = ReturnType<typeof useAction>["run"];

function SectionCard({
  section,
  index,
  total,
  run,
  pending,
  labTitles,
  sections,
}: {
  section: SectionWithItems;
  index: number;
  total: number;
  run: Run;
  pending: boolean;
  labTitles: Record<string, { title: string; runtime: "terminal" | "compile" }>;
  sections: SectionWithItems[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(section.title);
  const [description, setDescription] = useState(section.description ?? "");
  const [kind, setKind] = useState<ItemKind>("article");
  const [itemTitle, setItemTitle] = useState("");

  return (
    <div className="card-brut overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b-4 border-ink bg-paper-sunk px-4 py-3">
        <span className="font-mono text-xs font-bold text-ink/50">{String(index + 1).padStart(2, "0")}</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== section.title && run(() => updateSection(section.id, { title }))}
          className="min-w-0 flex-1 rounded-lg border-[3px] border-transparent bg-transparent px-2 py-1 font-display text-lg font-bold hover:border-ink/30 focus:border-ink focus:bg-white focus:outline-none"
          aria-label="Section title"
        />
        <button type="button" className="btn btn-ghost btn-sm" disabled={index === 0 || pending} onClick={() => run(() => moveSection(section.id, -1))} aria-label="Move section up"><ArrowUp className="size-4" /></button>
        <button type="button" className="btn btn-ghost btn-sm" disabled={index === total - 1 || pending} onClick={() => run(() => moveSection(section.id, 1))} aria-label="Move section down"><ArrowDown className="size-4" /></button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={pending}
          onClick={() => confirm(`Delete section “${section.title}” and its ${section.items.length} items?`) && run(() => deleteSection(section.id))}
          aria-label="Delete section"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="border-b-2 border-ink/10 px-4 py-2">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={() => description !== (section.description ?? "") && run(() => updateSection(section.id, { description }))}
          placeholder="Optional section description"
          className="w-full rounded-lg border-[3px] border-transparent bg-transparent px-2 py-1 text-sm hover:border-ink/30 focus:border-ink focus:bg-white focus:outline-none"
          aria-label="Section description"
        />
      </div>

      <ul>
        {section.items.map((item, ii) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 border-b-2 border-ink/10 px-4 py-2.5 last:border-0">
            <ItemIcon kind={item.kind} runtime={item.lab_id ? labTitles[item.lab_id]?.runtime : null} />
            <div className="min-w-0 flex-1">
              <Link href={`/studio/items/${item.id}`} className="block truncate font-semibold hover:underline">{item.title}</Link>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {item.kind === "lab" && (
                  item.lab_id && labTitles[item.lab_id] ? (
                    <span className="font-mono text-[10px] font-bold uppercase text-ink/50">{labTitles[item.lab_id].runtime} · {labTitles[item.lab_id].title}</span>
                  ) : (
                    <span className="font-mono text-[10px] font-bold uppercase text-[#C2183A]">no lab attached</span>
                  )
                )}
              </div>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold" title="Required for course completion">
              <input type="checkbox" checked={item.required} onChange={(e) => run(() => updateItem(item.id, { required: e.target.checked }))} className="accent-[#1B1F3B]" /> Required
            </label>
            <label className="flex items-center gap-1.5 text-xs font-semibold" title="Open to signed-in learners without enrolling">
              <input type="checkbox" checked={item.is_preview} onChange={(e) => run(() => updateItem(item.id, { is_preview: e.target.checked }))} className="accent-[#1B1F3B]" /> Preview
            </label>
            {sections.length > 1 && (
              <select
                className="rounded-lg border-2 border-ink bg-white px-1.5 py-1 text-xs"
                value={section.id}
                onChange={(e) => run(() => updateItem(item.id, { section_id: e.target.value }))}
                aria-label="Move to section"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            )}
            <div className="flex">
              <button type="button" className="btn btn-ghost btn-sm" disabled={ii === 0 || pending} onClick={() => run(() => moveItem(item.id, -1))} aria-label="Move up"><ArrowUp className="size-4" /></button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={ii === section.items.length - 1 || pending} onClick={() => run(() => moveItem(item.id, 1))} aria-label="Move down"><ArrowDown className="size-4" /></button>
              <Link href={`/studio/items/${item.id}`} className="btn btn-ghost btn-sm" aria-label="Edit"><Pencil className="size-4" /></Link>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => confirm(`Delete “${item.title}”? Learner progress on it will be lost.`) && run(() => deleteItem(item.id))} aria-label="Delete"><Trash2 className="size-4" /></button>
            </div>
          </li>
        ))}
        {section.items.length === 0 && <li className="px-4 py-4 text-sm text-ink/50">No items yet.</li>}
      </ul>

      <form
        className="flex flex-wrap gap-2 border-t-[3px] border-ink bg-paper-sunk/50 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => addItem(section.id, kind, itemTitle), {
            onSuccess: (data) => {
              setItemTitle("");
              if (data?.id) router.push(`/studio/items/${data.id}`);
            },
            refresh: false,
          });
        }}
      >
        <select value={kind} onChange={(e) => setKind(e.target.value as ItemKind)} className="input-brut input-sm w-auto" aria-label="Item type">
          <option value="article">Article</option>
          <option value="lab">Lab</option>
          <option value="quiz">Quiz</option>
        </select>
        <input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="Title" className="input-brut input-sm min-w-0 flex-1" aria-label="Item title" />
        <button type="submit" className="btn btn-secondary btn-sm" disabled={pending}>
          <Plus className="size-4" /> Add item
        </button>
      </form>
    </div>
  );
}
