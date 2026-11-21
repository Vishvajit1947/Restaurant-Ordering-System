"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Controller, useForm, useWatch, type Path } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FieldError, FoodImage, InlineError, Spinner } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { spiceLabel } from "@/lib/format";
import type { Category, MenuItem } from "@/lib/types";

const schema = z.object({
  category_id: z.string().min(1, "Choose a category"),
  name: z.string().trim().min(2, "At least 2 characters").max(100),
  description: z.string().trim().max(500, "At most 500 characters"),
  price: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a price like 249 or 249.50")
    .refine((v) => Number(v) > 0 && Number(v) <= 100000, "Price must be between ₹0.01 and ₹1,00,000"),
  prep_time_minutes: z.coerce.number().int("Whole minutes only").min(1).max(180),
  spice_level: z.coerce.number().int().min(0).max(3),
  is_vegetarian: z.boolean(),
  is_available: z.boolean(),
  image_url: z.string().nullable(),
});
type Values = z.input<typeof schema>;
type Output = z.output<typeof schema>;

export function MenuItemForm({ item }: { item?: MenuItem }) {
  const router = useRouter();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const categories = useQuery({ queryKey: ["admin-categories"], queryFn: () => api<Category[]>("/admin/categories") });

  const form = useForm<Values, unknown, Output>({
    resolver: zodResolver(schema),
    defaultValues: {
      category_id: item?.category.id ?? "",
      name: item?.name ?? "",
      description: item?.description ?? "",
      price: item ? Number(item.price).toString() : "",
      prep_time_minutes: item?.prep_time_minutes ?? 15,
      spice_level: item?.spice_level ?? 0,
      is_vegetarian: item?.is_vegetarian ?? true,
      is_available: item?.is_available ?? true,
      image_url: item?.image_url ?? null,
    },
  });
  const { register, control, handleSubmit, formState, setError, setValue } = form;
  const imageUrl = useWatch({ control, name: "image_url" });

  const upload = async (file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Only JPEG, PNG or WebP images are allowed.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Images must be 2 MB or smaller.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<{ url: string }>("/admin/uploads/images", { method: "POST", body: fd });
      setValue("image_url", res.url, { shouldDirty: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (v: Output) => {
    setFormError(null);
    const body = { ...v, description: v.description || null };
    try {
      const saved = item
        ? await api<MenuItem>(`/admin/menu-items/${item.id}`, { method: "PATCH", body })
        : await api<MenuItem>("/admin/menu-items", { method: "POST", body });
      qc.invalidateQueries({ queryKey: ["admin-menu"] });
      qc.invalidateQueries({ queryKey: ["menu"] });
      qc.invalidateQueries({ queryKey: ["menu-item", saved.id] });
      qc.invalidateQueries({ queryKey: ["admin-menu-item", saved.id] });
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      toast.success(item ? "Menu item updated" : "Menu item created");
      router.push("/dashboard/menu");
    } catch (e) {
      if (e instanceof ApiError && e.fields.length) {
        e.fields.forEach((f) => setError(f.field as Path<Values>, { message: f.message }));
      } else if (e instanceof ApiError && e.code === "MENU_ITEM_NAME_TAKEN") {
        setError("name", { message: e.message });
      } else {
        setFormError(e instanceof Error ? e.message : "Could not save");
      }
    }
  };

  const err = formState.errors;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="m-stagger grid gap-6 lg:grid-cols-[1fr_320px]" noValidate>
      <div className="space-y-5 rounded-xl bg-white p-6 ring-1 ring-border">
        <InlineError message={formError} />
        <div>
          <Label htmlFor="name" className="mb-2">Name</Label>
          <Input id="name" aria-invalid={!!err.name} {...register("name")} />
          <FieldError message={err.name?.message} />
        </div>
        <div>
          <Label htmlFor="description" className="mb-2">Description</Label>
          <Textarea id="description" rows={3} maxLength={500} aria-invalid={!!err.description} {...register("description")} />
          <FieldError message={err.description?.message} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label className="mb-2">Category</Label>
            <Controller
              control={control}
              name="category_id"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full" aria-invalid={!!err.category_id}>
                    <SelectValue placeholder={categories.isLoading ? "Loading…" : "Choose a category"} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.data?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                        {!c.is_active && " (hidden)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={err.category_id?.message} />
          </div>
          <div>
            <Label htmlFor="price" className="mb-2">Price (₹)</Label>
            <Input id="price" inputMode="decimal" aria-invalid={!!err.price} {...register("price")} />
            <FieldError message={err.price?.message} />
          </div>
          <div>
            <Label htmlFor="prep" className="mb-2">Prep time (minutes)</Label>
            <Input id="prep" type="number" min={1} max={180} aria-invalid={!!err.prep_time_minutes} {...register("prep_time_minutes")} />
            <FieldError message={err.prep_time_minutes?.message} />
          </div>
          <div>
            <Label className="mb-2">Spice level</Label>
            <Controller
              control={control}
              name="spice_level"
              render={({ field }) => (
                <Select value={String(field.value)} onValueChange={(v) => field.onChange(Number(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[0, 1, 2, 3].map((l) => (
                      <SelectItem key={l} value={String(l)}>
                        {spiceLabel(l)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Controller
            control={control}
            name="is_vegetarian"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm">
                Vegetarian
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
          <Controller
            control={control}
            name="is_available"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-xl bg-muted px-4 py-3 text-sm">
                Available for ordering
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl bg-white p-6 ring-1 ring-border">
          <p className="mb-3 text-sm">Photo</p>
          <FoodImage src={imageUrl ?? null} alt="Menu item photo" className="aspect-[4/3] w-full rounded-lg" />
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
          <div className="mt-3 flex gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Spinner /> : <ImageUp />} {imageUrl ? "Replace" : "Upload"}
            </Button>
            {imageUrl && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setValue("image_url", null, { shouldDirty: true })}>
                <Trash2 /> Remove
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">JPEG, PNG or WebP, up to 2 MB.</p>
        </div>
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={formState.isSubmitting || uploading}>
            {formState.isSubmitting && <Spinner />}
            {item ? "Save changes" : "Create item"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/menu")}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  );
}
