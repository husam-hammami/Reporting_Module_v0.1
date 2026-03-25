const ConfirmationModal = ({
  isOpen,
  title = 'Confirm',
  description = 'Are you sure?',
  onConfirm,
  onCancel,
  confirmText = 'Yes',
  cancelText = 'Cancel',
  confirmColor = 'brand',
  id,
}) => {
  if (!isOpen) return null;

  const colorMap = {
    brand: 'bg-brand hover:bg-brand-hover',
    red: 'bg-[#dc2626] hover:bg-[#b91c1c]',
    green: 'bg-[#059669] hover:bg-[#047857]',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-[#131b2d] rounded-xl shadow-xl border border-[#e3e9f0] dark:border-[#1e2d40] p-6 w-full max-w-sm">
        <h3 className="text-[13px] font-semibold text-[#2a3545] dark:text-[#e1e8f0] mb-2">
          {title}
        </h3>
        <p className="text-[11px] text-[#6b7f94] mb-5 leading-relaxed whitespace-pre-line">
          {description}
        </p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-[11px] font-medium rounded-lg border border-[#e3e9f0] dark:border-[#1e2d40] text-[#6b7f94] hover:bg-[#f5f8fb] dark:hover:bg-[#1a2840] transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={() => onConfirm(id)}
            className={`px-3 py-1.5 text-[11px] font-medium rounded-lg text-white transition-colors ${colorMap[confirmColor] || colorMap.brand}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
