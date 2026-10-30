import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import Modal from './components/common/Modal';

import type {
  AIProvider, ImportHistoryEntry, AIExtractedProduct, EnterpriseVariant,
  VariantAttribute, SEOData, SocialSEO, ContentData, SEOScore, StructuredSchemas,
} from './features/ai/types';
import {
  DEFAULT_AI_PROVIDERS, loadAIProviders, saveAIProviders, resolveActiveProvider,
} from './features/ai/providers';
import {
  callAIProvider, serverGenerate, serverTestProvider,
  serverOpenRouterCredits, serverProviderStatus,
} from './features/ai/client';
import type { ProviderStatus, ProviderStatusMap } from './features/ai/client';
import {
  fetchPageContent, buildExtractionPrompt, extractProductJson, parseHtmlPage,
  normalizeProductTitle, extractAliExpressItemId, assessAliExpressRisk,
  deriveImportReadiness, findDuplicateProduct, buildImportImages,
  buildImportVariants, buildImportProductInput,
  buildStorageImageInputs, importProductImagesToStorage,
  buildUrlEvidenceProduct, buildScrapedEvidenceProduct, mergeScrapedWithAi, requireReviewEvidence,
  extractAliExpressUrlEvidence, isEmptyExtraction,
} from './features/ai/importer';

export type {
  AIProvider, ImportHistoryEntry, AIExtractedProduct, EnterpriseVariant,
  VariantAttribute, SEOData, SocialSEO, ContentData, SEOScore, StructuredSchemas,
  ProviderStatus, ProviderStatusMap,
};
export {
  Modal,
  DEFAULT_AI_PROVIDERS, loadAIProviders, saveAIProviders, resolveActiveProvider,
  callAIProvider, serverGenerate, serverTestProvider, serverOpenRouterCredits,
  serverProviderStatus,
  fetchPageContent, buildExtractionPrompt,
  extractProductJson, parseHtmlPage, normalizeProductTitle,
  extractAliExpressItemId, assessAliExpressRisk, deriveImportReadiness,
  findDuplicateProduct, buildImportImages, buildImportVariants,
  buildImportProductInput, buildStorageImageInputs, importProductImagesToStorage,
  buildUrlEvidenceProduct, buildScrapedEvidenceProduct, mergeScrapedWithAi, requireReviewEvidence,
  extractAliExpressUrlEvidence, isEmptyExtraction,
};

export interface ProductVariant {
  id: string; color: string; size: string; price: number; salePrice: number;
  stock: number; sku: string; image?: string;
}

export interface Product {
  id: string; name: string; shortDesc: string; description: string; price: number;
  originalPrice: number; category: string; stock: number;
  images: string[]; imageAlts: string[]; rating: number; reviews: number; isActive: boolean;
  brand: string; condition: string; tags: string[];
  weight: string; dimensions: string; origin: string;
  longDescription?: string | null; features?: unknown; specifications?: unknown; weightOz?: number | null;
  freeShipping: boolean; shippingCost: string;
  variants: ProductVariant[];
  featured?: boolean; newArrival?: boolean; saleEnabled?: boolean;
  sortOrder?: number;
  createdAt?: string;
  stockStatus?: string; usInventory?: boolean;
  seoTitle?: string; seoDescription?: string; seoKeywords?: string[];
  slug?: string;
  supplierSource?: string;
  supplierProductRef?: string;
  supplierUrl?: string | null;
  safetyClass?: import('./features/catalog/productSafety').ProductSafetyClass | null;
  safetyReviewStatus?: import('./features/catalog/productSafety').ProductSafetyReviewStatus | null;
  intendedSpecies?: string | null;
  commerceReadiness?: string; sourceType?: string; inventorySource?: string;
  deliveryMinDays?: number | null; deliveryMaxDays?: number | null;
}

export interface CartItem { product: Product; quantity: number; }
export interface AppUser { id: string; email: string; name: string; role: 'admin' | 'buyer'; password?: string; isBlocked?: boolean; joined?: string; }
export interface Order {
  id: string; userId: string; userName: string; items: CartItem[];
  total: number; status: string; date: string; address?: string;
}
export interface Review {
  id: string; productId: string; productName: string; userName: string;
  rating: number; comment: string; status: 'pending' | 'approved' | 'rejected';
  date: string;
}
export interface AdminCategory {
  id: string;
  name: string;
  slug?: string;
  isActive: boolean;
  subs: { id: string; name: string; slug?: string; count?: number; isActive?: boolean }[];
}
export interface BlogPost {
  id: string; slug: string; title: string; excerpt: string; content: string;
  image: string; images: string[]; tags: string[];
  authorId: string; authorName: string;
  status: 'published' | 'draft' | 'pending';
  date: string;
  faq?: { q: string; a: string }[];
}

export const CAT_LIST = [
  'All',
  'Edible Salt',
  'Bath & Wellness',
  'Salt Lamps',
  'Cooking Blocks & Tiles',
  'Animal Lick Salt',
  'Industrial & Deicing Salt',
  'Specialty & Black Salt',
];

export interface Ctx {
  user: AppUser | null; cart: CartItem[];
  products: Product[]; users: AppUser[]; reviews: Review[]; categories: AdminCategory[];
  blogs: BlogPost[]; setBlogs: React.Dispatch<React.SetStateAction<BlogPost[]>>;
  reloadBlogs: (forceFresh?: boolean) => Promise<void>;
  login: (e: string, p: string, admin?: boolean) => Promise<string | null>;
  guestLogin: () => void;
  logout: () => void; signup: (n: string, e: string, p: string) => Promise<string | null>;
  changePassword: (current: string, newPass: string) => Promise<{ ok: boolean; msg: string }>;
  updateAdminProfile: (name: string, email: string) => void;
  addToCart: (p: Product) => void; removeFromCart: (id: string) => void;
  updateQty: (id: string, q: number) => void; clearCart: () => void;
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  setUsers: React.Dispatch<React.SetStateAction<AppUser[]>>;
  setReviews: React.Dispatch<React.SetStateAction<Review[]>>;
  setCategories: React.Dispatch<React.SetStateAction<AdminCategory[]>>;
  cartOpen: boolean; openCart: () => void; closeCart: () => void;
  notif: { msg: string; type: 'success' | 'error' | 'info' } | null;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
  merchStats: Map<string, unknown>;
  coupon: unknown;
  applyCoupon: (c: string) => string | null;
  removeCoupon: () => void;
  freeShippingEnabled: boolean;
  freeShippingThreshold: number;
}

const defaultAppContext: Ctx = {
  user: { id: 'admin-hk', email: 'admin@himalayankoh.com', name: 'Salman Bashir', role: 'admin' },
  cart: [],
  products: [],
  users: [],
  reviews: [],
  categories: [],
  blogs: [],
  setBlogs: () => {},
  reloadBlogs: async () => {},
  login: async () => null,
  guestLogin: () => {},
  logout: () => {},
  signup: async () => null,
  changePassword: async () => ({ ok: false, msg: '' }),
  updateAdminProfile: () => {},
  addToCart: () => {},
  removeFromCart: () => {},
  updateQty: () => {},
  clearCart: () => {},
  setProducts: () => {},
  setUsers: () => {},
  setReviews: () => {},
  setCategories: () => {},
  cartOpen: false,
  openCart: () => {},
  closeCart: () => {},
  notif: null,
  notify: (msg: string, type?: 'success' | 'error' | 'info') => {
    if (typeof window !== 'undefined') {
      console.log(`[Admin Notice] [${type || 'info'}]: ${msg}`);
    }
  },
  merchStats: new Map(),
  coupon: null,
  applyCoupon: () => null,
  removeCoupon: () => {},
  freeShippingEnabled: true,
  freeShippingThreshold: 50,
};

const AC = createContext<Ctx>(defaultAppContext);

export function useApp(): Ctx {
  const c = useContext(AC);
  return c || defaultAppContext;
}

const INITIAL_USERS: AppUser[] = [
  { id: 'usr-1', name: 'Salman Bashir', email: 'admin@himalayankoh.com', role: 'admin', joined: '2025-01-01', isBlocked: false },
  { id: 'usr-2', name: 'Ayaz Bashir', email: 'ayaz@himalayankoh.com', role: 'admin', joined: '2025-01-10', isBlocked: false },
  { id: 'usr-3', name: 'Himalayan Support Desk', email: 'support@himalayankoh.com', role: 'buyer', joined: '2025-02-01', isBlocked: false },
  { id: 'usr-4', name: 'Wholesale Sales Desk', email: 'sales@himalayankoh.com', role: 'buyer', joined: '2025-02-15', isBlocked: false },
];

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<AppUser>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('hk_admin_profile');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return defaultAppContext.user!;
  });
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<AppUser[]>(INITIAL_USERS);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [notif, setNotif] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);

  const notify = useCallback((msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotif({ msg, type });
    setTimeout(() => setNotif(null), 4000);
  }, []);

  const updateAdminProfile = useCallback((name: string, email: string) => {
    setCurrentUser(prev => {
      const updated: AppUser = { ...prev, name, email };
      if (typeof window !== 'undefined') {
        try { localStorage.setItem('hk_admin_profile', JSON.stringify(updated)); } catch {}
      }
      return updated;
    });
    setUsers(prev =>
      prev.map(u => (u.id === 'usr-1' || u.email === 'admin@himalayankoh.com' ? { ...u, name, email } : u))
    );
    notify('Profile updated successfully!', 'success');
  }, [notify]);

  const value: Ctx = useMemo(() => ({
    ...defaultAppContext,
    user: currentUser,
    updateAdminProfile,
    products, setProducts,
    users, setUsers,
    reviews, setReviews,
    categories, setCategories,
    blogs, setBlogs,
    notif, notify,
  }), [currentUser, updateAdminProfile, products, users, reviews, categories, blogs, notif, notify]);

  return (
    <AC.Provider value={value}>
      {children}
      {notif && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 ${
          notif.type === 'error' ? 'bg-red-600 text-white' :
          notif.type === 'success' ? 'bg-emerald-600 text-white' :
          'bg-gray-900 text-white'
        }`}>
          <span>{notif.msg}</span>
        </div>
      )}
    </AC.Provider>
  );
}

export default AppProvider;
