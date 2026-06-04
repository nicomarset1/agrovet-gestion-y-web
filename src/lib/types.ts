export type Branch = {
  id: number;
  slug: string;
  name: string;
  address: string;
  phone: string;
  verified: boolean;
  mapUrl?: string;
};

export type Stock = {
  branchId: number;
  branchName: string;
  quantity: number;
};

export type Variant = {
  id: number;
  label: string;
  sku: string;
  barcode: string;
  priceCents: number;
  stocks: Stock[];
  totalStock: number;
};

export type Product = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  species: "perro" | "gato" | "perro-gato";
  lifeStage: string;
  size: string;
  need: string;
  description: string;
  featured: boolean;
  requiresAdvice: boolean;
  color: string;
  imageUrl: string;
  variants: Variant[];
};

export type Category = {
  id: number;
  slug: string;
  name: string;
  description: string;
  showInMenu: boolean;
  parentCategoryId: number | null;
  parentCategorySlug: string | null;
  parentCategoryName: string | null;
};

export type CatalogFilters = {
  q?: string;
  category?: string | string[];
  subcategory?: string | string[];
  pet?: string;
  brand?: string | string[];
  stage?: string | string[];
  size?: string | string[];
  need?: string | string[];
  presentation?: string | string[];
  minPrice?: string;
  maxPrice?: string;
  stock?: string;
  sort?: string;
};

export type CartItemPayload = {
  variantId: number;
  quantity: number;
};

export type SearchIndexItem = {
  id: number;
  slug: string;
  name: string;
  brand: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  species: Product["species"];
  priceCents: number;
  totalStock: number;
};

export type OrderItemRecord = {
  variantId: number;
  productName: string;
  brand: string;
  label: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  allocations?: {
    branchId: number;
    branchName: string;
    quantity: number;
  }[];
};

export type OrderRecord = {
  id: number;
  code: string;
  customerName: string;
  phone: string;
  email: string;
  fulfillment: string;
  deliveryAddress: string;
  deliveryDistanceKm: number | null;
  branchId: number;
  branchName: string;
  totalCents: number;
  status: string;
  source: string;
  paymentMethod: string;
  paidCents: number;
  createdAt: string;
  itemCount: number;
  items: OrderItemRecord[];
};

export type LowStockItem = {
  variantId: number;
  productId: number;
  productName: string;
  productSlug: string;
  label: string;
  sku: string;
  branchId: number;
  branchName: string;
  quantity: number;
  donorBranchId: number | null;
  donorBranchName: string | null;
  donorQuantity: number | null;
};

export type WholesaleClient = {
  id: number;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  taxId: string;
  notes: string;
  createdAt: string;
};

export type CatalogMenuNode = {
  label: string;
  href: string;
  count?: number;
  children?: CatalogMenuNode[];
};
