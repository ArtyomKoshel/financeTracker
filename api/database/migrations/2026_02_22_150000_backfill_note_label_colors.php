<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::table('note_labels')
            ->whereNull('color')
            ->update(['color' => '#6366f1']);
    }

    public function down(): void {}
};
