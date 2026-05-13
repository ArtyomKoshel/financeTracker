<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_folders', function (Blueprint $table) {
            $table->string('color', 7)->nullable()->default('#6366f1')->after('name');
        });
    }

    public function down(): void
    {
        Schema::table('note_folders', function (Blueprint $table) {
            $table->dropColumn('color');
        });
    }
};
