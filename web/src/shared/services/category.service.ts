import api from '@/api/client';
import type { Category, CategoryWithSubs } from '@/types';

export interface CreateCategoryParams {
  name: string;
  parentId?: number;
  icon?: string;
  color?: string;
}

export interface UpdateCategoryParams {
  id: number;
  name: string;
  icon?: string;
  color?: string;
}

/**
 * Category service for business logic
 */
class CategoryService {
  private cache: CategoryWithSubs[] | null = null;

  /**
   * Get all categories (cached)
   */
  async getAll(includeInactive = false): Promise<CategoryWithSubs[]> {
    if (!includeInactive && this.cache) {
      return this.cache;
    }

    const categories = await api.getCategories(includeInactive);
    
    if (!includeInactive) {
      this.cache = categories;
    }
    
    return categories;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = null;
  }

  /**
   * Create a new category
   */
  async create(params: CreateCategoryParams): Promise<CategoryWithSubs> {
    this.clearCache();
    return api.createCategory({
      name: params.name,
      parent_id: params.parentId,
      icon: params.icon,
      color: params.color,
    });
  }

  /**
   * Update a category
   */
  async update(params: UpdateCategoryParams): Promise<CategoryWithSubs> {
    this.clearCache();
    return api.updateCategory({
      id: params.id,
      name: params.name,
      icon: params.icon,
      color: params.color,
    });
  }

  /**
   * Delete a category (soft delete)
   */
  async delete(id: number): Promise<void> {
    this.clearCache();
    await api.deleteCategory(id);
  }

  /**
   * Restore a deleted category
   */
  async restore(id: number): Promise<void> {
    this.clearCache();
    await api.restoreCategory(id);
  }

  /**
   * Get flat list of all categories (for selects)
   */
  async getFlatList(): Promise<{ id: number; name: string; icon: string; parentId?: number }[]> {
    const categories = await this.getAll();
    const result: { id: number; name: string; icon: string; parentId?: number }[] = [];

    for (const cat of categories) {
      result.push({
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
      });

      for (const sub of cat.subcategories || []) {
        result.push({
          id: sub.id,
          name: sub.name,
          icon: sub.icon,
          parentId: cat.id,
        });
      }
    }

    return result;
  }

  /**
   * Find category by ID
   */
  findById(categories: CategoryWithSubs[], id: number): Category | undefined {
    for (const cat of categories) {
      if (cat.id === id) return cat;
      for (const sub of cat.subcategories || []) {
        if (sub.id === id) return sub;
      }
    }
    return undefined;
  }
}

export const categoryService = new CategoryService();
export default categoryService;
