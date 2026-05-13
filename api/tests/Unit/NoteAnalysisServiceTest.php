<?php

namespace Tests\Unit;

use App\Services\NoteAnalysisService;
use Tests\TestCase;

class NoteAnalysisServiceTest extends TestCase
{
    private NoteAnalysisService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new NoteAnalysisService;
    }

    public function test_generate_summary_returns_empty_for_empty_content(): void
    {
        $this->assertSame('', $this->service->generateSummary(''));
        $this->assertSame('', $this->service->generateSummary('   '));
    }

    public function test_generate_summary_returns_short_text_as_is(): void
    {
        $text = 'Short note about groceries.';

        $summary = $this->service->generateSummary($text);

        $this->assertSame($text, $summary);
    }

    public function test_generate_summary_strips_html_tags(): void
    {
        $html = '<p>Hello <strong>world</strong></p>';

        $summary = $this->service->generateSummary($html);

        $this->assertStringNotContainsString('<p>', $summary);
        $this->assertStringNotContainsString('<strong>', $summary);
        $this->assertStringContainsString('Hello', $summary);
    }

    public function test_generate_summary_truncates_long_text_at_sentence_boundary(): void
    {
        $text = 'First sentence. Second sentence. Third sentence. '
            .str_repeat('This is a very long sentence that goes on and on. ', 10);

        $summary = $this->service->generateSummary($text);

        $this->assertLessThanOrEqual(200, mb_strlen($summary));
        $this->assertStringContainsString('First sentence', $summary);
    }

    public function test_generate_summary_adds_ellipsis_when_no_sentence_fits(): void
    {
        $text = str_repeat('a', 300);

        $summary = $this->service->generateSummary($text);

        $this->assertLessThanOrEqual(201, mb_strlen($summary));
        $this->assertStringEndsWith('…', $summary);
    }

    public function test_generate_summary_collapses_whitespace(): void
    {
        $text = "Hello   \n\n   world   test";

        $summary = $this->service->generateSummary($text);

        $this->assertSame('Hello world test', $summary);
    }
}
