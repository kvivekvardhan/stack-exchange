export default function Modal({ title, onClose, disableClose = false, children }) {
  function handleClose() {
    if (!disableClose) {
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <section className="modal-card" onClick={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={handleClose} disabled={disableClose}>
            Close
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
