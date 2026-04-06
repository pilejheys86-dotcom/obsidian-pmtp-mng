import { useState } from 'react';

/**
 * Reusable Pagination Component
 *
 * @param {Object} props
 * @param {number} props.currentPage - Currently active page (1-indexed)
 * @param {number} props.totalPages - Total number of pages
 * @param {number} props.totalItems - Total number of items
 * @param {number} props.itemsPerPage - Items shown per page
 * @param {Function} props.onPageChange - Callback when page changes
 * @param {string} props.itemLabel - Label for items (e.g. "loans", "items")
 */
const Pagination = ({
    currentPage: controlledPage,
    totalPages = 1,
    totalItems = 0,
    itemsPerPage = 10,
    onPageChange,
    itemLabel = 'items',
}) => {
    const [internalPage, setInternalPage] = useState(1);
    const currentPage = controlledPage !== undefined ? controlledPage : internalPage;

    const handlePageChange = (page) => {
        if (page < 1 || page > totalPages || page === currentPage) return;
        if (onPageChange) {
            onPageChange(page);
        } else {
            setInternalPage(page);
        }
    };

    // Calculate display range
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    // Generate visible page numbers with ellipsis
    const getPageNumbers = () => {
        const pages = [];

        if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
            return pages;
        }

        // Always show first page
        pages.push(1);

        if (currentPage > 3) {
            pages.push('...');
        }

        // Pages around current
        const start = Math.max(2, currentPage - 1);
        const end = Math.min(totalPages - 1, currentPage + 1);
        for (let i = start; i <= end; i++) {
            pages.push(i);
        }

        if (currentPage < totalPages - 2) {
            pages.push('...');
        }

        // Always show last page
        pages.push(totalPages);

        return pages;
    };

    return (
        <div className="loans-table-footer">
            <p className="pagination-info">
                Showing <span>{startItem}-{endItem}</span> of <span>{totalItems.toLocaleString()}</span> {itemLabel}
            </p>
            <div className="pagination">
                {/* Previous */}
                <button
                    className="pagination-btn"
                    disabled={currentPage === 1}
                    onClick={() => handlePageChange(currentPage - 1)}
                >
                    <span className="material-symbols-outlined text-lg">chevron_left</span>
                </button>

                {/* Page Numbers */}
                {getPageNumbers().map((page, index) =>
                    page === '...' ? (
                        <span key={`ellipsis-${index}`} className="pagination-ellipsis">...</span>
                    ) : (
                        <button
                            key={page}
                            className={`pagination-btn ${page === currentPage ? 'active' : ''}`}
                            onClick={() => handlePageChange(page)}
                        >
                            {page}
                        </button>
                    )
                )}

                {/* Next */}
                <button
                    className="pagination-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => handlePageChange(currentPage + 1)}
                >
                    <span className="material-symbols-outlined text-lg">chevron_right</span>
                </button>
            </div>
        </div>
    );
};

export default Pagination;
