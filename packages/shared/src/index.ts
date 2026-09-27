export type Role = "OWNER" | "MANAGER" | "EMPLOYEE";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  organizationId: string;
  branchId: string | null;
}

export interface Branch {
  id: string;
  organizationId: string;
  name: string;
  address?: string | null;
  isMain: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  size: string | null;
  color: string | null;
  price: string | null;
  inventory: { id: string; branchId: string; quantity: number }[];
}

export interface Product {
  id: string;
  organizationId: string;
  categoryId: string | null;
  name: string;
  description?: string | null;
  basePrice: string;
  imageUrl?: string | null;
  hasVariants: boolean;
  isArchived: boolean;
  variants: ProductVariant[];
  category?: { id: string; name: string } | null;
}

export interface CartItem {
  variantId: string;
  productName: string;
  size: string | null;
  color: string | null;
  unitPrice: number;
  quantity: number;
  maxQuantity: number;
}

export type PaymentMethod = "CASH" | "MPESA" | "CARD";
export type SaleStatus = "PENDING_PAYMENT" | "COMPLETED" | "CANCELED" | "REFUNDED";
