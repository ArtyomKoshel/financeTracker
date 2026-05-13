import api from '@/api/client';
import type { Note, NoteFolder, NoteLabel, SuggestNoteResponse } from '@/types';

class NotesService {
  async getAll(params?: { query?: string; folder_id?: number; label_id?: number }): Promise<Note[]> {
    return api.getNotes(params);
  }

  async create(data: { title: string; content: string; folder_id?: number; is_pinned?: boolean; color?: string; label_ids?: number[] }): Promise<Note> {
    return api.createNote(data);
  }

  async update(id: number, data: { title?: string; content?: string; folder_id?: number; is_pinned?: boolean; color?: string; label_ids?: number[] }): Promise<Note> {
    return api.updateNote(id, data);
  }

  async delete(id: number): Promise<void> {
    await api.deleteNote(id);
  }

  async analyze(id: number): Promise<{ note: Note; summary: string; action_items: string[] }> {
    return api.analyzeNote(id);
  }

  async formatContent(content: string): Promise<string> {
    return api.formatNoteContent(content);
  }

  async suggest(content: string): Promise<SuggestNoteResponse> {
    return api.suggestNote(content);
  }

  async append(noteId: number, content: string): Promise<Note> {
    return api.appendToNote(noteId, content);
  }

  async togglePin(id: number): Promise<Note> {
    return api.toggleNotePin(id);
  }

  async reorder(orderedIds: number[]): Promise<void> {
    return api.reorderNotes(orderedIds);
  }

  async getFolders(): Promise<NoteFolder[]> {
    return api.getNoteFolders();
  }

  async createFolder(data: { name: string; color?: string; parent_id?: number }): Promise<NoteFolder> {
    return api.createNoteFolder(data);
  }

  async updateFolder(id: number, data: { name: string; color?: string }): Promise<NoteFolder> {
    return api.updateNoteFolder(id, data);
  }

  async deleteFolder(id: number): Promise<void> {
    return api.deleteNoteFolder(id);
  }

  async getLabels(): Promise<NoteLabel[]> {
    return api.getNoteLabels();
  }

  async createLabel(data: { name: string; color: string }): Promise<NoteLabel> {
    return api.createNoteLabel(data);
  }

  async deleteLabel(id: number): Promise<void> {
    return api.deleteNoteLabel(id);
  }
}

export const notesService = new NotesService();
