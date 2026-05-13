<?php

namespace App\Http\Requests\Transactions;

use Illuminate\Foundation\Http\FormRequest;

class StoreTransactionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function withValidator($validator): void
    {
        $validator->after(function ($validator) {
            if ($this->input('type') === 'transfer') {
                $from = (int) $this->input('account_id');
                $to = (int) $this->input('transfer_to_account_id');
                if ($from && $to && $from === $to) {
                    $validator->errors()->add('transfer_to_account_id', 'Счёт назначения должен отличаться от счёта источника');
                }
            }
        });
    }

    public function rules(): array
    {
        $allowedTypes = $this->getAllowedTypes();
        $type = $this->input('type');
        $goalRequired = in_array($type, ['savings', 'savings_withdrawal']);
        $transferRequired = $type === 'transfer';

        return [
            'date' => 'required|date',
            'amount' => 'required|numeric|min:0.01',
            'type' => 'required|string|in:'.implode(',', $allowedTypes),
            'currency' => 'nullable|string|in:BYN,RUB,EUR,USD,GBP,PLN',
            'category_id' => 'nullable|integer|exists:categories,id',
            'recurring_payment_id' => 'nullable|integer|exists:recurring_payments,id',
            'goal_id' => $goalRequired ? 'required|integer|exists:goals,id' : 'nullable|integer|exists:goals,id',
            'account_id' => $transferRequired ? 'required|integer|exists:accounts,id' : 'nullable|integer|exists:accounts,id',
            'transfer_to_account_id' => $transferRequired ? 'required|integer|exists:accounts,id' : 'nullable|integer|exists:accounts,id',
            'description' => 'nullable|string',
            'month' => 'nullable|string',
            'source' => 'nullable|string|in:web,telegram,bank_receipt,email_parse,api',
            // Split transaction support
            'splits' => 'nullable|array|max:20',
            'splits.*.category_id' => 'required_with:splits|integer|exists:categories,id',
            'splits.*.amount' => 'required_with:splits|numeric|min:0.01',
            'splits.*.description' => 'nullable|string|max:500',
        ];
    }

    protected function getAllowedTypes(): array
    {
        $clientId = (int) (app('client_id') ?? $this->user()->id ?? 0);
        \App\Models\IncomeType::seedForClient($clientId);
        $incomeCodes = \App\Models\IncomeType::pluck('code')->all();
        $fixed = ['expense', 'savings', 'savings_withdrawal', 'correction', 'transfer'];

        return array_values(array_unique(array_merge($incomeCodes, $fixed)));
    }
}
