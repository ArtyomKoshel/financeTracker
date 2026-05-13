<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tags', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('name', 50);
            $table->string('color', 7)->default('#6C5CE7');
            $table->timestamps();
            $table->unique(['client_id', 'name']);
            $table->index('client_id');
            $table->foreign('client_id')->references('id')->on('users')->onDelete('cascade');
        });

        Schema::create('transaction_tag', function (Blueprint $table) {
            $table->unsignedBigInteger('transaction_id');
            $table->unsignedBigInteger('tag_id');
            $table->primary(['transaction_id', 'tag_id']);
            $table->foreign('transaction_id')->references('id')->on('transactions')->onDelete('cascade');
            $table->foreign('tag_id')->references('id')->on('tags')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transaction_tag');
        Schema::dropIfExists('tags');
    }
};
