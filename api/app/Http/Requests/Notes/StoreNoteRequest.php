<?php

namespace App\Http\Requests\Notes;

use Illuminate\Foundation\Http\FormRequest;

class StoreNoteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:255'],
            'content' => ['required', 'string', 'max:50000'],
            'folder_id' => ['nullable', 'integer', 'exists:note_folders,id'],
            'is_pinned' => ['nullable', 'boolean'],
            'color' => ['nullable', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'label_ids' => ['nullable', 'array', 'max:20'],
            'label_ids.*' => ['integer', 'exists:note_labels,id'],
        ];
    }
}
