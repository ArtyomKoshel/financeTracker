<?php

namespace Tests\Unit;

use App\Services\Notifications\TelegramParserService;
use Tests\TestCase;

class TelegramParserServiceTest extends TestCase
{
    private TelegramParserService $parser;

    /** @var array<string, string> */
    private array $incomeKeywords;

    protected function setUp(): void
    {
        parent::setUp();
        $this->parser = new TelegramParserService;
        $this->incomeKeywords = [
            'зп' => 'salary',
            'зарплата' => 'salary',
            'аванс' => 'advance',
            'премия' => 'bonus',
            'доход' => 'other',
        ];
    }

    public function test_parse_description_then_amount(): void
    {
        $result = $this->parser->parse('кофе 5.50');

        $this->assertNotNull($result);
        $this->assertEquals(5.50, $result['amount']);
        $this->assertEquals('expense', $result['type']);
        $this->assertEquals('кофе', $result['description']);
    }

    public function test_parse_amount_then_description(): void
    {
        $result = $this->parser->parse('100 такси');

        $this->assertNotNull($result);
        $this->assertEquals(100, $result['amount']);
        $this->assertEquals('expense', $result['type']);
        $this->assertEquals('такси', $result['description']);
    }

    public function test_parse_amount_only(): void
    {
        $result = $this->parser->parse('42');

        $this->assertNotNull($result);
        $this->assertEquals(42, $result['amount']);
        $this->assertEquals('expense', $result['type']);
        $this->assertEquals('', $result['description']);
    }

    public function test_parse_income_keyword_zp(): void
    {
        $result = $this->parser->parse('зп 5000', $this->incomeKeywords);

        $this->assertNotNull($result);
        $this->assertEquals(5000, $result['amount']);
        $this->assertEquals('salary', $result['type']);
    }

    public function test_parse_income_keyword_zarplata(): void
    {
        $result = $this->parser->parse('зарплата 3500', $this->incomeKeywords);

        $this->assertNotNull($result);
        $this->assertEquals(3500, $result['amount']);
        $this->assertEquals('salary', $result['type']);
    }

    public function test_parse_income_with_description(): void
    {
        $result = $this->parser->parse('доход 1000 фриланс', $this->incomeKeywords);

        $this->assertNotNull($result);
        $this->assertEquals(1000, $result['amount']);
        $this->assertEquals('other', $result['type']);
        $this->assertEquals('фриланс', $result['description']);
    }

    public function test_parse_income_keyword_avans(): void
    {
        $result = $this->parser->parse('аванс 2500', $this->incomeKeywords);

        $this->assertNotNull($result);
        $this->assertEquals(2500, $result['amount']);
        $this->assertEquals('advance', $result['type']);
    }

    public function test_parse_income_bonus(): void
    {
        $result = $this->parser->parse('премия 1000', $this->incomeKeywords);

        $this->assertNotNull($result);
        $this->assertEquals(1000, $result['amount']);
        $this->assertEquals('bonus', $result['type']);
        $this->assertEquals('премия', $result['description']);
    }

    public function test_parse_without_keywords_defaults_to_expense(): void
    {
        $result = $this->parser->parse('зарплата 3500');

        $this->assertNotNull($result);
        $this->assertEquals(3500, $result['amount']);
        $this->assertEquals('expense', $result['type']);
    }

    public function test_parse_with_custom_income_type(): void
    {
        $custom = ['фриланс' => 'freelance'];
        $result = $this->parser->parse('фриланс 1500', $custom);

        $this->assertNotNull($result);
        $this->assertEquals(1500, $result['amount']);
        $this->assertEquals('freelance', $result['type']);
    }

    public function test_parse_comma_decimal(): void
    {
        $result = $this->parser->parse('обед 15,90');

        $this->assertNotNull($result);
        $this->assertEquals(15.90, $result['amount']);
        $this->assertEquals('expense', $result['type']);
        $this->assertEquals('обед', $result['description']);
    }

    public function test_parse_returns_null_for_empty(): void
    {
        $this->assertNull($this->parser->parse(''));
        $this->assertNull($this->parser->parse('   '));
    }

    public function test_parse_returns_null_for_no_amount(): void
    {
        $this->assertNull($this->parser->parse('просто текст без цифр'));
    }

    public function test_parse_amount_with_currency_suffix(): void
    {
        $result = $this->parser->parse('кофе 5.50 byn');

        $this->assertNotNull($result);
        $this->assertEquals(5.50, $result['amount']);
        $this->assertEquals('кофе', $result['description']);
    }

    public function test_parse_integer_description(): void
    {
        $result = $this->parser->parse('молоко хлеб 12');

        $this->assertNotNull($result);
        $this->assertEquals(12, $result['amount']);
        $this->assertEquals('молоко хлеб', $result['description']);
    }
}
