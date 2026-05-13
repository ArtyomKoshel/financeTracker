<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('client_id');
            $table->string('title');
            $table->text('content');
            $table->text('summary')->nullable();
            $table->timestamps();

            $table->index('client_id');
            $table->index('created_at');
        });

        DB::statement('ALTER TABLE notes ADD COLUMN search_vector tsvector');
        DB::statement('CREATE INDEX notes_search_vector_gin ON notes USING GIN (search_vector)');

        DB::statement("
            CREATE OR REPLACE FUNCTION notes_search_vector_update() RETURNS trigger AS $$
            BEGIN
                NEW.search_vector := setweight(to_tsvector('russian', coalesce(NEW.title, '')), 'A')
                    || setweight(to_tsvector('russian', coalesce(NEW.content, '')), 'B');
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        ");

        DB::statement('
            CREATE TRIGGER notes_search_vector_trigger
            BEFORE INSERT OR UPDATE OF title, content ON notes
            FOR EACH ROW EXECUTE FUNCTION notes_search_vector_update();
        ');
    }

    public function down(): void
    {
        DB::statement('DROP TRIGGER IF EXISTS notes_search_vector_trigger ON notes');
        DB::statement('DROP FUNCTION IF EXISTS notes_search_vector_update()');
        Schema::dropIfExists('notes');
    }
};
