import React from 'react';
import { PdfAnalysis } from '../components/sections/PdfAnalysis';

export function UploadPage() {
  return (
    <div className="h-full bg-white overflow-y-auto custom-scrollbar">
      <PdfAnalysis />
    </div>
  );
}
