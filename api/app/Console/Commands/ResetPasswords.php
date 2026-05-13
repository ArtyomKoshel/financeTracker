<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class ResetPasswords extends Command
{
    protected $signature = 'passwords:reset';

    protected $description = 'Reset passwords for default users: admin@local/admin123, demo@local/demo123';

    public function handle()
    {
        $users = [
            ['email' => 'admin@local', 'password' => 'admin123'],
            ['email' => 'demo@local', 'password' => 'demo123'],
            ['email' => 'default@local', 'password' => 'client123'],
        ];

        foreach ($users as $u) {
            $hash = Hash::make($u['password']);
            $updated = DB::table('users')->where('email', $u['email'])->update(['password_hash' => $hash]);
            if ($updated) {
                $this->info("Updated: {$u['email']} / {$u['password']}");
            } else {
                $this->warn("Not found: {$u['email']}");
            }
        }

        $this->info('Done.');

        return 0;
    }
}
