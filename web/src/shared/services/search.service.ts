import api from '@/api/client';
import type { SearchResults } from '@/types';

class SearchService {
  async search(query: string): Promise<SearchResults> {
    return api.search(query);
  }
}

export const searchService = new SearchService();
