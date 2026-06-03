'use client';

import React from 'react';

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 py-8 px-4 mt-auto">
      <div className="max-w-7xl mx-auto text-center">
        <p className="text-church-grey text-sm">
          &copy; {new Date().getFullYear()} Diocese of San Pablo. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
