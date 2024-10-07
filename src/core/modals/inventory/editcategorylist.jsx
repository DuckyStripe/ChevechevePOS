import React, { useState, useEffect } from "react";
import PropTypes from "prop-types"; // Importa PropTypes

const EditCategoryList = ({ categoryData }) => {
  const [valor, setValor] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [estatus, setEstatus] = useState(true);

  useEffect(() => {
    if (categoryData) {
      setValor(categoryData.valor || "");
      setEtiqueta(categoryData.etiqueta || "");
      setEstatus(categoryData.estatus === 1); // Corrige la asignación inicial de estatus
    }
  }, [categoryData]);

  const handleUpdateCategory = () => {
    // Aquí manejarías la lógica para actualizar la categoría
    console.log("Updated Category:", {
      valor,
      etiqueta,
      estatus,
    });

    // Asegúrate de cerrar el modal después de actualizar los datos, si es apropiado
  };

  return (
    <div>
      {/* Modal para Editar Categoría */}
      <div className="modal fade" id="edit-category">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Editar Categoría</h4>
                  </div>
                  <button
                    type="button"
                    className="close"
                    data-bs-dismiss="modal"
                    aria-label="Close"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
                <div className="modal-body custom-modal-body">
                  <form>
                    <div className="mb-3">
                      <label className="form-label">Categoría</label>
                      <input
                        type="text"
                        className="form-control"
                        value={valor}
                        onChange={(e) => setValor(e.target.value)}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Descripción</label>
                      <input
                        type="text"
                        className="form-control"
                        value={etiqueta}
                        onChange={(e) => setEtiqueta(e.target.value)}
                      />
                    </div>
                    <div className="mb-0">
                      <div className="status-toggle modal-status d-flex justify-content-between align-items-center">
                        <span className="status-label">Estatus</span>
                        <input
                          type="checkbox"
                          id="status"
                          className="check"
                          checked={estatus}
                          onChange={(e) => {
                            setEstatus(e.target.checked);
                          }}
                        />

                        <label htmlFor="status" className="checktoggle" />
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        className="btn btn-submit"
                        onClick={handleUpdateCategory}
                      >
                        Actualizar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

EditCategoryList.propTypes = {
  categoryData: PropTypes.shape({
    valor: PropTypes.string.isRequired,
    etiqueta: PropTypes.string.isRequired,
    estatus: PropTypes.number.isRequired,
  }),
};

export default EditCategoryList;
