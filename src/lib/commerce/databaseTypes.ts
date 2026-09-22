export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          phone: string | null;
          avatar_url: string | null;
          role: 'customer' | 'admin';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: 'customer' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          phone?: string | null;
          avatar_url?: string | null;
          role?: 'customer' | 'admin';
          created_at?: string;
          updated_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          image_url: string | null;
          parent_id: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          image_url?: string | null;
          parent_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          image_url?: string | null;
          parent_id?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          short_description: string | null;
          price: number;
          compare_at_price: number | null;
          cost_price: number | null;
          sku: string | null;
          barcode: string | null;
          weight: number | null;
          weight_unit: string;
          category_id: string | null;
          images: string[];
          thumbnail: string | null;
          is_active: boolean;
          is_featured: boolean;
          grain_sizes: string[];
          tags: string[];
          meta_title: string | null;
          meta_description: string | null;
          pack_size: string | null;
          lead_time_days: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          short_description?: string | null;
          price: number;
          compare_at_price?: number | null;
          cost_price?: number | null;
          sku?: string | null;
          barcode?: string | null;
          weight?: number | null;
          weight_unit?: string;
          category_id?: string | null;
          images?: string[];
          thumbnail?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          grain_sizes?: string[];
          tags?: string[];
          meta_title?: string | null;
          meta_description?: string | null;
          pack_size?: string | null;
          lead_time_days?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          short_description?: string | null;
          price?: number;
          compare_at_price?: number | null;
          cost_price?: number | null;
          sku?: string | null;
          barcode?: string | null;
          weight?: number | null;
          weight_unit?: string;
          category_id?: string | null;
          images?: string[];
          thumbnail?: string | null;
          is_active?: boolean;
          is_featured?: boolean;
          grain_sizes?: string[];
          tags?: string[];
          meta_title?: string | null;
          meta_description?: string | null;
          pack_size?: string | null;
          lead_time_days?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          image_url: string;
          alt_text: string | null;
          sort_order: number;
          is_thumbnail: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          image_url: string;
          alt_text?: string | null;
          sort_order?: number;
          is_thumbnail?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          image_url?: string;
          alt_text?: string | null;
          sort_order?: number;
          is_thumbnail?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      category_hub_overrides: {
        Row: {
          category_key: string;
          hero: Json;
          seo: Json;
          trust_points: Json;
          is_published: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          category_key: string;
          hero?: Json;
          seo?: Json;
          trust_points?: Json;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          category_key?: string;
          hero?: Json;
          seo?: Json;
          trust_points?: Json;
          is_published?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      inventory: {
        Row: {
          id: string;
          product_id: string;
          quantity: number;
          reserved_quantity: number;
          low_stock_threshold: number;
          track_inventory: boolean;
          allow_backorder: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          quantity?: number;
          reserved_quantity?: number;
          low_stock_threshold?: number;
          track_inventory?: boolean;
          allow_backorder?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          quantity?: number;
          reserved_quantity?: number;
          low_stock_threshold?: number;
          track_inventory?: boolean;
          allow_backorder?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      addresses: {
        Row: {
          id: string;
          user_id: string;
          label: string | null;
          full_name: string;
          phone: string | null;
          address_line1: string;
          address_line2: string | null;
          city: string;
          state: string;
          postal_code: string;
          country: string;
          is_default_shipping: boolean;
          is_default_billing: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          label?: string | null;
          full_name: string;
          phone?: string | null;
          address_line1: string;
          address_line2?: string | null;
          city: string;
          state: string;
          postal_code: string;
          country?: string;
          is_default_shipping?: boolean;
          is_default_billing?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          label?: string | null;
          full_name?: string;
          phone?: string | null;
          address_line1?: string;
          address_line2?: string | null;
          city?: string;
          state?: string;
          postal_code?: string;
          country?: string;
          is_default_shipping?: boolean;
          is_default_billing?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      carts: {
        Row: {
          id: string;
          user_id: string | null;
          session_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          session_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      cart_items: {
        Row: {
          id: string;
          cart_id: string;
          product_id: string;
          quantity: number;
          grain_size: string | null;
          unit_price: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cart_id: string;
          product_id: string;
          quantity?: number;
          grain_size?: string | null;
          unit_price: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cart_id?: string;
          product_id?: string;
          quantity?: number;
          grain_size?: string | null;
          unit_price?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      wishlists: {
        Row: {
          id: string;
          user_id: string;
          product_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          product_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          product_id?: string;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          user_id: string | null;
          email: string;
          phone: string | null;
          status: 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
          payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
          payment_method: string | null;
          subtotal: number;
          shipping_cost: number;
          tax_amount: number;
          discount_amount: number;
          total: number;
          currency: string;
          shipping_address: Json;
          billing_address: Json;
          notes: string | null;
          tracking_number: string | null;
          tracking_url: string | null;
          shippo_rate_id: string | null;
          shippo_transaction_id: string | null;
          shipping_carrier: string | null;
          shipping_service: string | null;
          label_url: string | null;
          shipped_at: string | null;
          delivered_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          user_id?: string | null;
          email: string;
          phone?: string | null;
          status?: 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
          payment_status?: 'pending' | 'paid' | 'failed' | 'refunded';
          payment_method?: string | null;
          subtotal: number;
          shipping_cost?: number;
          tax_amount?: number;
          discount_amount?: number;
          total: number;
          currency?: string;
          shipping_address: Json;
          billing_address: Json;
          notes?: string | null;
          tracking_number?: string | null;
          tracking_url?: string | null;
          shippo_rate_id?: string | null;
          shippo_transaction_id?: string | null;
          shipping_carrier?: string | null;
          shipping_service?: string | null;
          label_url?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          user_id?: string | null;
          email?: string;
          phone?: string | null;
          status?: 'pending' | 'confirmed' | 'processing' | 'packed' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
          payment_status?: 'pending' | 'paid' | 'failed' | 'refunded';
          payment_method?: string | null;
          subtotal?: number;
          shipping_cost?: number;
          tax_amount?: number;
          discount_amount?: number;
          total?: number;
          currency?: string;
          shipping_address?: Json;
          billing_address?: Json;
          notes?: string | null;
          tracking_number?: string | null;
          tracking_url?: string | null;
          shippo_rate_id?: string | null;
          shippo_transaction_id?: string | null;
          shipping_carrier?: string | null;
          shipping_service?: string | null;
          label_url?: string | null;
          shipped_at?: string | null;
          delivered_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name: string;
          product_image: string | null;
          quantity: number;
          grain_size: string | null;
          unit_price: number;
          total_price: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name: string;
          product_image?: string | null;
          quantity: number;
          grain_size?: string | null;
          unit_price: number;
          total_price: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          product_image?: string | null;
          quantity?: number;
          grain_size?: string | null;
          unit_price?: number;
          total_price?: number;
          created_at?: string;
        };
      };
      blog_posts: {
        Row: {
          id: string;
          title: string;
          slug: string;
          excerpt: string | null;
          content: string | null;
          featured_image: string | null;
          author_id: string | null;
          category: string | null;
          tags: string[];
          is_published: boolean;
          published_at: string | null;
          meta_title: string | null;
          meta_description: string | null;
          read_time: number;
          view_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          excerpt?: string | null;
          content?: string | null;
          featured_image?: string | null;
          author_id?: string | null;
          category?: string | null;
          tags?: string[];
          is_published?: boolean;
          published_at?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          read_time?: number;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          excerpt?: string | null;
          content?: string | null;
          featured_image?: string | null;
          author_id?: string | null;
          category?: string | null;
          tags?: string[];
          is_published?: boolean;
          published_at?: string | null;
          meta_title?: string | null;
          meta_description?: string | null;
          read_time?: number;
          view_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: 'order' | 'promotion' | 'system' | 'reminder';
          title: string;
          message: string;
          data: Json | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: 'order' | 'promotion' | 'system' | 'reminder';
          title: string;
          message: string;
          data?: Json | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: 'order' | 'promotion' | 'system' | 'reminder';
          title?: string;
          message?: string;
          data?: Json | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        };
      };
      reviews: {
        Row: {
          id: string;
          product_id: string;
          user_id: string;
          rating: number;
          title: string | null;
          comment: string | null;
          is_verified_purchase: boolean;
          is_approved: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          user_id: string;
          rating: number;
          title?: string | null;
          comment?: string | null;
          is_verified_purchase?: boolean;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          user_id?: string;
          rating?: number;
          title?: string | null;
          comment?: string | null;
          is_verified_purchase?: boolean;
          is_approved?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      contact_submissions: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          subject: string;
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          subject: string;
          message: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          subject?: string;
          message?: string;
          created_at?: string;
        };
      };
      newsletter_subscribers: {
        Row: {
          id: string;
          email: string;
          source: string;
          subscribed_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          source?: string;
          subscribed_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          source?: string;
          subscribed_at?: string;
        };
      };
      crm_leads: {
        Row: {
          id: string;
          name: string;
          email: string;
          phone: string | null;
          company: string | null;
          source: 'contact_form' | 'manual' | 'other';
          contact_submission_id: string | null;
          profile_id: string | null;
          status: 'new' | 'contacted' | 'qualified' | 'won' | 'lost';
          subject: string | null;
          notes: string | null;
          assigned_to: string | null;
          last_contacted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          email: string;
          phone?: string | null;
          company?: string | null;
          source?: 'contact_form' | 'manual' | 'other';
          contact_submission_id?: string | null;
          profile_id?: string | null;
          status?: 'new' | 'contacted' | 'qualified' | 'won' | 'lost';
          subject?: string | null;
          notes?: string | null;
          assigned_to?: string | null;
          last_contacted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          phone?: string | null;
          company?: string | null;
          source?: 'contact_form' | 'manual' | 'other';
          contact_submission_id?: string | null;
          profile_id?: string | null;
          status?: 'new' | 'contacted' | 'qualified' | 'won' | 'lost';
          subject?: string | null;
          notes?: string | null;
          assigned_to?: string | null;
          last_contacted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      crm_activities: {
        Row: {
          id: string;
          lead_id: string;
          admin_id: string | null;
          activity_type: 'note' | 'call' | 'email' | 'meeting' | 'status_change' | 'follow_up';
          body: string;
          due_at: string | null;
          completed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          admin_id?: string | null;
          activity_type?: 'note' | 'call' | 'email' | 'meeting' | 'status_change' | 'follow_up';
          body: string;
          due_at?: string | null;
          completed?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          admin_id?: string | null;
          activity_type?: 'note' | 'call' | 'email' | 'meeting' | 'status_change' | 'follow_up';
          body?: string;
          due_at?: string | null;
          completed?: boolean;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      order_status:
        | 'pending'
        | 'confirmed'
        | 'processing'
        | 'packed'
        | 'shipped'
        | 'delivered'
        | 'cancelled'
        | 'refunded';
      payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
      user_role: 'customer' | 'admin';
      notification_type: 'order' | 'promotion' | 'system' | 'reminder';
    };
  };
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type InsertTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type UpdateTables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

// Specific types for easier use
export type Profile = Tables<'profiles'>;
export type Category = Tables<'categories'>;
export type Product = Tables<'products'>;
export type ProductImage = Tables<'product_images'>;
export type Inventory = Tables<'inventory'>;
export type Address = Tables<'addresses'>;
export type Cart = Tables<'carts'>;
export type CartItem = Tables<'cart_items'>;
export type Wishlist = Tables<'wishlists'>;
export type Order = Tables<'orders'>;
export type OrderItem = Tables<'order_items'>;
export type BlogPost = Tables<'blog_posts'>;
export type Notification = Tables<'notifications'>;
export type Review = Tables<'reviews'>;

// CRM
export type CrmLead = Tables<'crm_leads'>;
export type CrmActivity = Tables<'crm_activities'>;
export type CrmLeadWithAssignee = CrmLead & {
  assignee: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};


// Product with relations
export type ProductWithCategory = Product & {
  category: Category | null;
  inventory: Inventory | null;
  product_images?: ProductImage[];
  reviews?: Review[];
};

// Cart with items
export type CartWithItems = Cart & {
  cart_items: (CartItem & { product: Product })[];
};

// Order with items
export type OrderWithItems = Order & {
  order_items: OrderItem[];
};
