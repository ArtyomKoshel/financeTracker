<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_experimental_features', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->string('feature_code', 50);
            $table->unsignedBigInteger('granted_by')->nullable();
            $table->timestamp('granted_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'feature_code']);
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
            $table->foreign('granted_by')->references('id')->on('users')->onDelete('set null');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_experimental_features');
    }
};
