export interface Product {
  id: string;
  code?: string;
  sku?: string;
  name: string;
  description?: string;
  category: string;
  brand: string;
  price: number;
  stock: number;
  minStock?: number;
  maxStock?: number;
  image: string;
  images?: string[];
  isFeatured?: boolean;
  isRefurbished?: boolean;
  isNewProduct?: boolean;
  condition?: string;
  applianceType?: string;
  mercadoLibre?: {
    itemId?: string;
    permalink?: string;
    status?: string;
    categoryId?: string;
    listingTypeId?: string;
    lastSyncAt?: number;
    lastSyncStatus?: 'ok' | 'error' | 'pending';
    lastSyncError?: string;
  };
  createdAt?: number | any;
  updatedAt?: number | any;
}

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  date: string;
}

export interface Order {
  id: string;
  status: string;
  date: string;
  total: number;
  items: { productId: string; quantity: number }[];
  customer: {
    name: string;
    email: string;
    phone: string;
  };
}

export interface Repair {
  id: string;
  status: string;
  date: string;
  applianceType: string;
  brandModel: string;
  problem: string;
  customer: {
    name: string;
    email: string;
    phone: string;
  };
}
