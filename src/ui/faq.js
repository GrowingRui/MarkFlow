const FAQS = [
  ['What is MarkFlow?', 'MarkFlow is a browser-based converter that turns PDFs, Office documents, web pages, and other files into clean, structured Markdown.'],
  ['Is MarkFlow the same as Markdown?', 'No. Markdown is a plain-text formatting language. MarkFlow is a tool that converts your files into Markdown.'],
  ['Why is Markdown useful for AI agents?', 'Markdown keeps headings, lists, and tables as simple text, so AI tools can read the structure without parsing complex layouts.'],
  ['Can I use converted Markdown to create AI skills or agent instructions?', 'Yes. Converted procedures, notes, and references can be edited into prompts, skills, or agent instructions.'],
  ['What file formats does MarkFlow support?', 'PDF, DOCX, PPTX, XLSX, XLS, HTML, CSV, JSON, XML, IPYNB, EPUB, ZIP, PNG, JPG, JPEG, and WEBP.'],
  ['Are my files uploaded during conversion?', 'No. Files are processed in your browser and are not sent to our servers.'],
  ['How accurate is the conversion?', 'Text, headings, lists, and tables convert reliably from well-structured files. Scanned or heavily designed documents may need a quick review.'],
  ['Is PDF to Markdown always perfect?', 'Not always. Complex layouts, multi-column pages, and scanned pages can need light cleanup. Use the preview to check before downloading.'],
  ['Why should I convert Office documents to Markdown?', 'Markdown is portable, easy to version in Git, and readable by both people and AI tools, unlike app-specific formats.'],
  ['Can I batch convert multiple files?', 'Yes. Upload a ZIP file or upgrade your plan to convert more files at once.'],
  ['Which Markdown flavor does MarkFlow output?', 'MarkFlow outputs GitHub-flavored Markdown, which works in most editors, documentation tools, and Git hosts.'],
  ['Do I need an account to use MarkFlow?', 'No. You can convert 3 files a day without an account. A free account raises that to 30 a day, and your files still never leave your browser.'],
  ['What should I do after converting a file?', 'Review the preview, download the .md file, and add it to your docs, repository, knowledge base, or AI workflow.'],
];

export function renderFaq() {
  document.getElementById('faq').innerHTML = FAQS.map(([q, a]) => `
    <details class="border-b border-rule">
      <summary class="faq-q flex cursor-pointer items-center justify-between gap-6 py-5 text-[16px] font-semibold">
        <span>${q}</span>
        <svg class="plus h-4 w-4 shrink-0 text-teal" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      </summary>
      <p class="max-w-[38em] pb-6 pr-8 text-[15px] text-slate2/70">${a}</p>
    </details>`).join('');
}
