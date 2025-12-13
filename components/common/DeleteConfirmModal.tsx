import React, { useState, useEffect } from 'react';
import { X, Trash2, AlertTriangle, Loader2 } from 'lucide-react';

interface DeleteConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  requireTypedConfirmation?: boolean;
  confirmInputPlaceholder?: string;
  confirmInputValue?: string;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmText = 'Delete',
  onConfirm,
  onCancel,
  requireTypedConfirmation = false,
  confirmInputPlaceholder = 'Type DELETE to confirm',
  confirmInputValue = 'DELETE'
}) => {
  const [confirmInput, setConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setConfirmInput('');
      setIsDeleting(false);
      setError(null);
    }
  }, [isOpen]);

  const handleConfirm = async () => {
    if (requireTypedConfirmation && confirmInput !== confirmInputValue) {
      return;
    }

    setIsDeleting(true);
    setError(null); // Clear any previous errors

    try {
      await onConfirm();
      // If we reach here, the operation succeeded
      // The parent component should handle closing the modal
    } catch (error) {
      console.error('Delete operation failed:', error);
      // Extract user-friendly error message
      const errorMessage = error instanceof Error
        ? error.message
        : 'An unexpected error occurred while deleting. Please try again.';

      setError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const isConfirmDisabled = requireTypedConfirmation
    ? confirmInput !== confirmInputValue || isDeleting
    : isDeleting;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-red-100 overflow-hidden transform transition-all animate-in slide-in-from-bottom-4 duration-300">

        {/* Header with Danger Icon */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 leading-tight">
                {title}
              </h2>
            </div>
            <button
              onClick={onCancel}
              disabled={isDeleting}
              className="text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Message */}
          <p className="text-slate-600 text-sm leading-relaxed">
            {message}
          </p>

          {/* Error Message */}
          {error && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="text-red-700 text-sm">
                  <p className="font-medium">Delete failed</p>
                  <p className="mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Type-to-Confirm Input (if required) */}
        {requireTypedConfirmation && (
          <div className="px-6 pb-4">
            <div className="relative">
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder={confirmInputPlaceholder}
                disabled={isDeleting}
                className="w-full bg-slate-50 border border-red-200 focus:bg-white focus:border-red-300 rounded-xl py-3 px-4 text-slate-900 text-sm focus:ring-2 focus:ring-red-100 outline-none transition-all placeholder:text-slate-400 disabled:opacity-50"
                autoFocus
              />
              {confirmInput === confirmInputValue && (
                <div className="absolute right-3 top-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Type <span className="font-mono font-semibold text-red-600">{confirmInputValue}</span> to enable deletion
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4" />
                {error ? 'Retry' : confirmText}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeleteConfirmModal;

