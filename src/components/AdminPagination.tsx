"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

type AdminPaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
};

function getVisiblePages(page: number, pageCount: number) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, index) => index + 1);
  let start = Math.max(1, page - 2);
  const end = Math.min(pageCount, start + 4);
  start = Math.max(1, end - 4);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function AdminPagination({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
}: AdminPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const first = total ? (currentPage - 1) * pageSize + 1 : 0;
  const last = total ? Math.min(currentPage * pageSize, total) : 0;

  return (
    <nav className="admin-pagination" aria-label="Account pages">
      <span className="admin-pagination-summary">
        {first}-{last} of {total}
      </span>
      <div className="admin-pagination-controls">
        <button
          type="button"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={loading || currentPage <= 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {getVisiblePages(currentPage, pageCount).map((pageNumber) => (
          <button
            key={pageNumber}
            type="button"
            className={pageNumber === currentPage ? "admin-pagination-active" : ""}
            onClick={() => onPageChange(pageNumber)}
            disabled={loading}
            aria-label={`Page ${pageNumber}`}
            aria-current={pageNumber === currentPage ? "page" : undefined}
          >
            {pageNumber}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={loading || currentPage >= pageCount}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
