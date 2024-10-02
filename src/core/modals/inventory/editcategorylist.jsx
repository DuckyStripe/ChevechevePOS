import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types'; // Importa PropTypes

const EditCategoryList = ({ categoryData }) => {
    const [categoryName, setCategoryName] = useState('');
    const [description, setDescription] = useState('');
    const [status, setStatus] = useState(true);
  
    useEffect(() => {
      if (categoryData) {
        setCategoryName(categoryData.category || '');
        setDescription(categoryData.categoryslug || ''); // Asegúrate de asignar al campo correcto
        setStatus(categoryData.status === 'Active');
      }
    }, [categoryData]);
    const handleUpdateCategory = () => {
        // Aquí manejarías la lógica para actualizar la categoría
        // Podrías hacer una llamada a una API o actualizar el estado global, según sea el caso
        console.log("Updated Category:", {
          categoryName,
          description,
          status: status ? 'Active' : 'Inactive'
        });
        
        // Asegúrate de cerrar el modal después de actualizar los datos, si es apropiado
        // Por ejemplo, podrías utilizar un método para cerrar el modal de Bootstrap manualmente o vía React
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
                          value={categoryName}
                          onChange={(e) => setCategoryName(e.target.value)}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Descripción</label>
                        <input
                          type="text"
                          className="form-control"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                        />
                      </div>
                      <div className="mb-0">
                        <div className="status-toggle modal-status d-flex justify-content-between align-items-center">
                          <span className="status-label">Estatus</span>
                          <input
                            type="checkbox"
                            id="user2"
                            className="check"
                            checked={status}
                            onChange={(e) => setStatus(e.target.checked)}
                          />
                          <label htmlFor="user2" className="checktoggle" />
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
    )
}
EditCategoryList.propTypes = {
    categoryData: PropTypes.shape({
      category: PropTypes.string.isRequired,
      categoryslug: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
    }),
  };
  
export default EditCategoryList
