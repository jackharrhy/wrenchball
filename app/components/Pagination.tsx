import { Link } from "react-router";
import { cn } from "~/utils/cn";

export const Pagination = ({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) => {
  if (totalPages <= 1) {
    return null;
  }

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    const showEllipsisThreshold = 7;

    if (totalPages <= showEllipsisThreshold) {
      // Show all pages
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (page > 3) {
        pages.push("...");
      }

      // Show pages around current
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 2) {
        pages.push("...");
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="flex items-center justify-center gap-1">
      <Link
        to={page > 1 ? `?page=${page - 1}` : "#"}
        className={cn(
          "px-3 py-1 rounded border",
          page > 1
            ? "border-cell-gray/50 bg-cell-gray/40 hover:bg-cell-gray/60 text-white"
            : "border-cell-gray/30 bg-cell-gray/20 text-gray-500 cursor-not-allowed",
        )}
        aria-disabled={page <= 1}
      >
        ← Prev
      </Link>

      {pageNumbers.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-gray-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            to={`?page=${p}`}
            className={cn(
              "px-3 py-1 rounded border",
              p === page
                ? "border-blue-200 bg-blue-400/60 text-white"
                : "border-cell-gray/50 bg-cell-gray/40 hover:bg-cell-gray/60 text-white",
            )}
          >
            {p}
          </Link>
        ),
      )}

      <Link
        to={page < totalPages ? `?page=${page + 1}` : "#"}
        className={cn(
          "px-3 py-1 rounded border",
          page < totalPages
            ? "border-cell-gray/50 bg-cell-gray/40 hover:bg-cell-gray/60 text-white"
            : "border-cell-gray/30 bg-cell-gray/20 text-gray-500 cursor-not-allowed",
        )}
        aria-disabled={page >= totalPages}
      >
        Next →
      </Link>
    </div>
  );
};
