/**
 * Finance Tracker - Main Entry Point
 * 
 * This is the entry point for the TypeScript frontend.
 * It imports and initializes the main application.
 */

// Import and initialize app
import './app';

// Also export useful utilities for console debugging
export { api } from '@/api/client';
export { toast } from '@/shared/components/toast';
export { wsService } from '@/shared/services/websocket.service';
export { store } from '@/store';
export * from '@/shared/utils/format';
