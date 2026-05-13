<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->string('category_name', 255)->nullable()->after('category_id');
        });

        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->dropForeign(['client_id']);
            $table->dropForeign(['category_id']);
            $table->dropIndex(['client_id', 'confidence']);
        });

        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->unsignedBigInteger('client_id')->nullable()->change();
            $table->unsignedBigInteger('category_id')->nullable()->change();
        });

        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->nullOnDelete();
            $table->index(['client_id']);
        });
    }

    public function down(): void
    {
        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->dropForeign(['client_id']);
            $table->dropIndex(['client_id']);
        });

        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->unsignedBigInteger('client_id')->nullable(false)->change();
            $table->unsignedBigInteger('category_id')->nullable(false)->change();
        });

        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->foreign('client_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('category_id')->references('id')->on('categories')->cascadeOnDelete();
            $table->index(['client_id', 'confidence']);
        });

        Schema::table('categorization_rules', function (Blueprint $table) {
            $table->dropColumn('category_name');
        });
    }
};
