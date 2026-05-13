<?php

namespace App\Http\Requests\Experimental;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class BankReceiptPreviewRequest extends FormRequest
{
    private const MAX_BASE64_BYTES = 14 * 1024 * 1024;

    private const MAX_TOTAL_BASE64_BYTES = 68 * 1024 * 1024;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'image_base64' => 'nullable|string|max:'.self::MAX_BASE64_BYTES,
            'pages' => 'nullable|array|max:20',
            'pages.*.base64' => 'required_with:pages|string|max:'.self::MAX_BASE64_BYTES,
            'pages.*.mime' => 'nullable|string|in:image/jpeg,image/png,image/webp',
            'mime' => 'nullable|string|in:image/jpeg,image/png,image/webp',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $total = 0;
            if ($this->has('pages') && is_array($this->input('pages'))) {
                foreach ($this->input('pages') as $p) {
                    $b64 = $p['base64'] ?? '';
                    $total += strlen($b64);
                }
            }
            if ($this->filled('image_base64')) {
                $total += strlen($this->input('image_base64'));
            }
            if ($total > self::MAX_TOTAL_BASE64_BYTES) {
                $v->errors()->add('pages', 'Общий размер файлов не должен превышать 50 МБ.');
            }
        });
    }
}
