import * as XLSX from 'xlsx';

/**
 * Exports data to an Excel (.xlsx) file and triggers download in the browser
 */
export function exportToExcelFile(
  data: Record<string, any>[],
  fileName: string,
  sheetName: string = 'Sheet1'
) {
  try {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    
    // Auto-size columns based on maximum content length
    const colWidths = Object.keys(data[0] || {}).map((key) => {
      const maxLen = Math.max(
        key.length,
        ...data.map((row) => (row[key] !== undefined && row[key] !== null ? String(row[key]).length : 0))
      );
      return { wch: Math.min(Math.max(maxLen + 3, 12), 50) };
    });
    worksheet['!cols'] = colWidths;

    XLSX.writeFile(workbook, `${fileName}.xlsx`);
    return true;
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return false;
  }
}

/**
 * Exports data to a CSV file with UTF-8 BOM for full Excel compatibility
 */
export function exportToCsvFile(
  headers: string[],
  rows: (string | number)[][],
  fileName: string
) {
  try {
    const escapeCell = (cell: string | number) => {
      const str = String(cell ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const csvContent =
      '\uFEFF' +
      headers.map(escapeCell).join(',') +
      '\n' +
      rows.map((row) => row.map(escapeCell).join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${fileName}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    return false;
  }
}
