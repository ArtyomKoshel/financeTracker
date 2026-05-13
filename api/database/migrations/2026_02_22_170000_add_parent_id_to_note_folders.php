<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('note_folders', function (Blueprint $table) {
            $table->unsignedBigInteger('parent_id')->nullable()->after('client_id');
            $table->foreign('parent_id')->references('id')->on('note_folders')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::table('note_folders', function (Blueprint $table) {
            $table->dropForeign(['parent_id']);
            $table->dropColumn('parent_id');
        });
    }
};
