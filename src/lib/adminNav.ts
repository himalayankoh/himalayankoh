import {
  LayoutDashboard,
  Package,
  FolderTree,
  Boxes,
  ShoppingCart,
  Users,
  Ticket,
  FileText,
  LayoutGrid,
  Image,
  Search as SearchIcon,
  Megaphone,
  BarChart3,
  Contact,
  Truck,
  UserCog,
  Settings,
  Gift,
  Star,
  TrendingUp,
  Mail,
  Sparkles,
  Wand as MagicWand,
  ListChecks,
  Crosshair,
  FlaskConical,
  SlidersHorizontal,
  Brain,
  Factory,
  CreditCard,
  BookOpen,
  Target,
  Send,
  type LucideIcon,
} from 'lucide-react';

/**
 * The admin console's navigation — one owner for its order, grouping and icons.
 *
 * The taxonomy is the Luxedge console's: Overview / Catalog / Media / Marketing /
 * AI Studio / System. Every Luxedge destination has an entry here (see
 * `docs/LUXEDGE-ADMIN-PARITY.md` for the route-by-route matrix), and the handful
 * that only exist in Himalayan Koh — Inventory, Customers, Category Hubs,
 * Analytics, Shipping Labels, Coupons, API Keys — sit in the group where a
 * Luxedge user would look for them rather than at the end of a flat list.
 *
 * `pending` marks a module whose screen is built but whose backend is not
 * connected: the rail dims a dot against it and the page states what it needs.
 * That flag is the difference between "not built" and "built, waiting on a
 * credential", which is otherwise impossible to tell apart from a screenshot.
 *
 * There is deliberately no mobile navigation list. The admin is a desktop tool
 * (see `ADMIN_CANVAS_MIN_WIDTH`), so the shell renders this rail at every
 * viewport instead of swapping to a drawer, bottom bar or hamburger.
 *
 * There is also no second entry for the integration keys: `AdminSettings` is one
 * screen ("Settings & API keys"), so a separate API Keys rail item pointed at the
 * same view — the audit found the duplicate. `/admin/api-keys` still resolves as
 * an alias for old links; it just is not a second destination in the rail.
 */

export interface AdminNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
  /** True when the section is built but its backend is not connected yet. */
  pending?: boolean;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'Overview',
    items: [{ label: 'Dashboard', path: '/admin', icon: LayoutDashboard }],
  },
  {
    label: 'LeadOS',
    items: [
      { label: 'LeadOS Workspace', path: '/admin/leados', icon: Target },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { label: 'Products', path: '/admin/products', icon: Package },
      { label: 'Promotions', path: '/admin/promotions', icon: Ticket, pending: true },
      { label: 'Gift Drop', path: '/admin/gift-drop', icon: Gift, pending: true },
      { label: 'Campaigns', path: '/admin/campaigns', icon: Megaphone, pending: true },
      { label: 'Orders', path: '/admin/orders', icon: ShoppingCart },
      { label: 'Customers', path: '/admin/customers', icon: Users },
      { label: 'Users', path: '/admin/users', icon: UserCog },
      { label: 'Categories', path: '/admin/categories', icon: FolderTree },
      { label: 'Reviews', path: '/admin/reviews', icon: Star, pending: true },
      { label: 'Blog Posts', path: '/admin/blog', icon: FileText },
      { label: 'Category Hubs', path: '/admin/category-hubs', icon: LayoutGrid },
      { label: 'Inventory', path: '/admin/inventory', icon: Boxes, pending: true },
      { label: 'Coupons', path: '/admin/coupons', icon: Ticket, pending: true },
    ],
  },
  {
    label: 'Media',
    items: [{ label: 'Media Hub', path: '/admin/media', icon: Image, pending: true }],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Marketing & Traffic', path: '/admin/marketing-traffic', icon: TrendingUp, pending: true },
      { label: 'CRM (Leads)', path: '/admin/crm', icon: Contact },
      { label: 'Analytics', path: '/admin/analytics', icon: BarChart3 },
    ],
  },
  {
    label: 'AI Studio',
    items: [
      { label: 'Variant Gen', path: '/admin/variant-gen', icon: Boxes },
      { label: 'AI Hub', path: '/admin/ai', icon: Sparkles, pending: true },
      { label: 'AI Import', path: '/admin/ai-import', icon: MagicWand, pending: true },
      { label: 'Listing Task', path: '/admin/listing-task', icon: ListChecks },
      { label: 'Product Scout', path: '/admin/scout', icon: Crosshair, pending: true },
      { label: 'Product Research', path: '/admin/product-research', icon: FlaskConical, pending: true },
      { label: 'AI Control', path: '/admin/ai-control', icon: SlidersHorizontal, pending: true },
      { label: 'AI Intelligence', path: '/admin/hermes-intel', icon: Brain, pending: true },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Shipping Labels', path: '/admin/labels', icon: Truck },
      { label: 'Suppliers', path: '/admin/suppliers', icon: Factory, pending: true },
      { label: 'Payments', path: '/admin/payments', icon: CreditCard },
      { label: 'Settings', path: '/admin/settings', icon: Settings },
      { label: 'Listing Playbook', path: '/admin/listing-playbook', icon: BookOpen },
    ],
  },
];

const NAV_ITEMS = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

/** The nav entry that owns a path — used for the console's breadcrumb. */
export function findAdminNavItem(pathname: string): AdminNavItem | undefined {
  return (
    NAV_ITEMS.find((item) => item.path === pathname) ??
    NAV_ITEMS.filter((item) => item.path !== '/admin').find((item) =>
      pathname.startsWith(`${item.path}/`)
    )
  );
}

/** How many destinations each group holds — the rail's section counts. */
export function adminNavCount(): number {
  return NAV_ITEMS.length;
}
