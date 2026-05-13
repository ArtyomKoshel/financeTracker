<?php

namespace App\Http\Controllers\Api\Transactions;

use App\Http\Controllers\Api\Controller;
use App\Http\Requests\Transactions\StoreTransactionTemplateRequest;
use App\Http\Requests\Transactions\UpdateTransactionTemplateRequest;
use App\Models\TransactionTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransactionTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        $clientId = $this->clientId();

        $templates = TransactionTemplate::withoutGlobalScope('client')
            ->with('category')
            ->where('client_id', $clientId)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(fn ($t) => [
                'id' => $t->id,
                'name' => $t->name,
                'type' => $t->type,
                'amount' => $t->amount,
                'currency' => $t->currency,
                'category_id' => $t->category_id,
                'category_name' => $t->category?->name,
                'category_icon' => $t->category?->icon,
                'description' => $t->description,
                'sort_order' => $t->sort_order,
            ]);

        return $this->success($templates);
    }

    public function store(StoreTransactionTemplateRequest $request): JsonResponse
    {

        $clientId = $this->clientId();

        $count = TransactionTemplate::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->count();

        if ($count >= 50) {
            return $this->error('Максимум 50 шаблонов', 422);
        }

        $template = TransactionTemplate::create([
            'client_id' => $clientId,
            'name' => $request->input('name'),
            'type' => $request->input('type'),
            'amount' => $request->input('amount'),
            'currency' => $request->input('currency', 'BYN'),
            'category_id' => $request->input('category_id'),
            'description' => $request->input('description'),
            'sort_order' => $count,
        ]);

        return $this->success([
            'id' => $template->id,
            'name' => $template->name,
            'type' => $template->type,
            'amount' => $template->amount,
            'currency' => $template->currency,
            'category_id' => $template->category_id,
            'description' => $template->description,
            'sort_order' => $template->sort_order,
        ]);
    }

    public function update(UpdateTransactionTemplateRequest $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();
        $template = TransactionTemplate::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $template) {
            return $this->error('Шаблон не найден', 404);
        }

        $template->update($request->only(['name', 'type', 'amount', 'currency', 'category_id', 'description']));

        return $this->success(['updated' => true]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $clientId = $this->clientId();

        $template = TransactionTemplate::withoutGlobalScope('client')
            ->where('client_id', $clientId)
            ->find($id);

        if (! $template) {
            return $this->error('Шаблон не найден', 404);
        }

        $template->delete();

        return $this->success(['deleted' => true]);
    }
}
