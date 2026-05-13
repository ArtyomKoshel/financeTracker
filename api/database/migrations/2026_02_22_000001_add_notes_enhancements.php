<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('note_folders', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('name');
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->index('client_id');
            $table->unique(['client_id', 'name']);
        });

        Schema::table('notes', function (Blueprint $table) {
            $table->unsignedBigInteger('folder_id')->nullable()->after('client_id');
            $table->boolean('is_pinned')->default(false)->after('summary');
            $table->string('color', 7)->nullable()->after('is_pinned');
            $table->integer('sort_order')->default(0)->after('color');
        });

        Schema::table('notes', function (Blueprint $table) {
            $table->foreign('folder_id')->references('id')->on('note_folders')->onDelete('set null');
            $table->index(['client_id', 'folder_id']);
            $table->index(['client_id', 'is_pinned']);
        });
    }

    public function down(): void
    {
        Schema::table('notes', function (Blueprint $table) {
            $table->dropForeign(['folder_id']);
            $table->dropIndex(['client_id', 'folder_id']);
            $table->dropIndex(['client_id', 'is_pinned']);
        });

        Schema::table('notes', function (Blueprint $table) {
            $table->dropColumn(['folder_id', 'is_pinned', 'color', 'sort_order']);
        });

        Schema::dropIfExists('note_folders');
    }
};
