<?php

namespace Tests\Unit;

use App\Models\Account;
use App\Models\CategorizationRule;
use App\Models\Category;
use App\Models\Transaction;
use App\Models\User;
use App\Services\Transactions\CategorizationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CategorizationServiceTest extends TestCase
{
    use RefreshDatabase;

    private CategorizationService $service;

    private int $clientId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(CategorizationService::class);
        $user = User::factory()->create();
        $this->clientId = $user->id;
        Account::withoutGlobalScope('client')->create([
            'name' => 'Test',
            'balance' => 0,
            'client_id' => $this->clientId,
        ]);
    }

    public function test_suggest_category_returns_null_for_short_description(): void
    {
        $result = $this->service->suggestCategory($this->clientId, 'a');

        $this->assertNull($result);
    }

    public function test_suggest_category_returns_null_for_empty_description(): void
    {
        $result = $this->service->suggestCategory($this->clientId, '   ');

        $this->assertNull($result);
    }

    public function test_suggest_category_returns_null_when_no_rules_or_history(): void
    {
        $result = $this->service->suggestCategory($this->clientId, 'Магнит супермаркет');

        $this->assertNull($result);
    }

    public function test_suggest_category_returns_from_rule_when_rule_exists(): void
    {
        $category = Category::withoutGlobalScope('client')->create([
            'name' => 'Продукты',
            'icon' => '🛒',
            'color' => '#4CAF50',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);
        CategorizationRule::create([
            'client_id' => $this->clientId,
            'merchant_pattern' => 'магнит супермаркет',
            'category_id' => $category->id,
            'confidence' => 5,
        ]);

        $result = $this->service->suggestCategory($this->clientId, 'Магнит супермаркет');

        $this->assertNotNull($result);
        $this->assertSame($category->id, $result['category_id']);
        $this->assertSame('Продукты', $result['category_name']);
        $this->assertSame('rule', $result['source']);
    }

    public function test_suggest_category_returns_from_history_when_similar_transaction_exists(): void
    {
        $category = Category::withoutGlobalScope('client')->create([
            'name' => 'Транспорт',
            'icon' => '🚗',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);
        $accountId = Account::withoutGlobalScope('client')->where('client_id', $this->clientId)->value('id');
        Transaction::withoutGlobalScope('client')->create([
            'client_id' => $this->clientId,
            'date' => now(),
            'amount' => -50,
            'type' => 'expense',
            'category_id' => $category->id,
            'account_id' => $accountId,
            'description' => 'Яндекс такси',
            'month' => now()->format('Y-m'),
        ]);

        $result = $this->service->suggestCategory($this->clientId, 'яндекс такси');

        $this->assertNotNull($result);
        $this->assertSame($category->id, $result['category_id']);
        $this->assertSame('history', $result['source']);
    }

    public function test_learn_from_input_creates_new_rule(): void
    {
        $category = Category::withoutGlobalScope('client')->create([
            'name' => 'Продукты',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);

        $this->service->learnFromInput($this->clientId, 'Вкусвилл', $category->id);

        $rule = CategorizationRule::where('client_id', $this->clientId)
            ->where('merchant_pattern', 'вкусвилл')
            ->first();
        $this->assertNotNull($rule);
        $this->assertSame(1, $rule->confidence);
    }

    public function test_learn_from_input_increments_confidence_for_existing_rule(): void
    {
        $category = Category::withoutGlobalScope('client')->create([
            'name' => 'Продукты',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);
        CategorizationRule::create([
            'client_id' => $this->clientId,
            'merchant_pattern' => 'вкусвилл',
            'category_id' => $category->id,
            'confidence' => 3,
        ]);

        $this->service->learnFromInput($this->clientId, 'Вкусвилл', $category->id);

        $rule = CategorizationRule::where('client_id', $this->clientId)
            ->where('merchant_pattern', 'вкусвилл')
            ->first();
        $this->assertSame(4, $rule->confidence);
    }

    public function test_learn_from_input_ignores_short_description(): void
    {
        $category = Category::withoutGlobalScope('client')->create([
            'name' => 'Продукты',
            'client_id' => $this->clientId,
            'is_active' => true,
        ]);

        $this->service->learnFromInput($this->clientId, 'a', $category->id);

        $count = CategorizationRule::where('client_id', $this->clientId)->count();
        $this->assertSame(0, $count);
    }
}
