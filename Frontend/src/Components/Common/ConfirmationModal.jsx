const ConfirmationModal = ({
  isOpen,
  title = 'Confirm',
  description = 'Are you sure?',
  onConfirm,
  onCancel,
  confirmText = 'Yes',
  cancelText = 'No',
  id,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 dark:bg-opacity-75">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 w-96">
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-white">
          {title}
        </h2>
        <p className="mb-6 text-gray-800 dark:text-gray-200">{description}</p>
        <div className="flex justify-between">
          {/* No button */}
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {cancelText}
          </button>
          {/* Yes button */}
          <button
            onClick={() => onConfirm(id)}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-400"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;
