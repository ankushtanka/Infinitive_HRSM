'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Megaphone, Briefcase, Lock, ArrowRight } from 'lucide-react';

export const PublicHeader: React.FC = () => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md text-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white p-1 shadow-sm border border-slate-200/20">
            <Image
              src="/infinitive-cloud-icon.png"
              alt="Infinitive Cloud logo"
              width={32}
              height={32}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-tight text-white">Infinitive Cloud</span>
            <span className="block text-[10px] font-semibold text-cyan-400">Enterprise HR Suite</span>
          </div>
        </Link>

        {/* Public Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-300">
          <Link href="/announcements" className="flex items-center gap-1.5 hover:text-white transition">
            <Megaphone className="h-4 w-4 text-emerald-400" />
            <span>Announcements</span>
          </Link>

          <Link href="/careers" className="flex items-center gap-1.5 hover:text-white transition">
            <Briefcase className="h-4 w-4 text-blue-400" />
            <span>Careers & Opportunities</span>
          </Link>
        </nav>

        {/* Employee Login Button */}
        <div className="flex items-center gap-3">
          <Link
            href="/super-admin/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 transition"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Employee Portal</span>
          </Link>
        </div>
      </div>
    </header>
  );
};
