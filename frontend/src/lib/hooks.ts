"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api, ApiError, errorMessage } from "./api";
import type { Cart, Category, Restaurant, User } from "./types";

export const qk = {
  me: ["me"] as const,
  restaurant: ["restaurant"] as const,
  categories: ["categories"] as const,
  menu: (params: object) => ["menu", params] as const,
  menuItem: (id: string) => ["menu-item", id] as const,
  cart: ["cart"] as const,
  orders: (params: object) => ["orders", params] as const,
  order: (id: string) => ["order", id] as const,
  adminOrders: (params: object) => ["admin-orders", params] as const,
  adminOrder: (id: string) => ["admin-order", id] as const,
};

export function useMe() {
  return useQuery<User | null>({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await api<User>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null;
        throw e;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export function useRestaurant() {
  return useQuery({
    queryKey: qk.restaurant,
    queryFn: () => api<Restaurant>("/restaurant"),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useCategories() {
  return useQuery({ queryKey: qk.categories, queryFn: () => api<Category[]>("/categories"), staleTime: 60 * 1000 });
}

export function useCart(enabled: boolean) {
  return useQuery({
    queryKey: qk.cart,
    queryFn: () => api<Cart>("/cart"),
    enabled,
    refetchOnWindowFocus: true,
  });
}

export function useCartMutations() {
  const qc = useQueryClient();
  const onSuccess = (cart: Cart) => qc.setQueryData(qk.cart, cart);
  const onError = (e: unknown) => {
    toast.error(errorMessage(e));
    qc.invalidateQueries({ queryKey: qk.cart });
  };

  const add = useMutation({
    mutationFn: (v: { menu_item_id: string; quantity?: number; name?: string }) =>
      api<Cart>("/cart/items", { method: "POST", body: { menu_item_id: v.menu_item_id, quantity: v.quantity ?? 1 } }),
    onSuccess: (cart, v) => {
      onSuccess(cart);
      toast.success(v.name ? `${v.name} added to your cart` : "Added to cart");
    },
    onError,
  });
  const setQty = useMutation({
    mutationFn: (v: { menu_item_id: string; quantity: number }) =>
      api<Cart>(`/cart/items/${v.menu_item_id}`, { method: "PATCH", body: { quantity: v.quantity } }),
    onSuccess,
    onError,
  });
  const remove = useMutation({
    mutationFn: (menu_item_id: string) => api<Cart>(`/cart/items/${menu_item_id}`, { method: "DELETE" }),
    onSuccess,
    onError,
  });
  const clear = useMutation({
    mutationFn: () => api<Cart>("/cart", { method: "DELETE" }),
    onSuccess,
    onError,
  });
  return { add, setQty, remove, clear };
}
