import React, { useState, useRef } from "react";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const AddRole = () => {
  const [formData, setFormData] = useState({
    role: ""
  });
  const [formErrors, setFormErrors] = useState({});
  const modalRef = useRef(null);
  const resetFormData = () => {
    setFormData({
      role: ""
    });
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.role) {
      errors.role = "El rol es obligatorio";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      try {
        console.log("Enviando datos: ", formData);
        toast.success("Rol agregado exitosamente");
  
        resetFormData();
  
        // Simula un clic en el botón de cancelar para cerrar el modal
        document.querySelector(".btn-cancel").click();
  
      } catch (error) {
        console.error("Error al enviar datos: ", error);
        toast.error("Error al agregar el rol");
      }
    }
  };
  
  
  

  return (
    <div>
      <ToastContainer />
      {/* Add Role */}
      <div className="modal fade" id="add-units" ref={modalRef}>
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Crear Rol</h4>
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
                  <form onSubmit={handleSubmit}>
                    <div className="mb-0">
                      <label className="form-label">Rol</label>
                      <input
                        type="text"
                        className="form-control"
                        name="role"
                        value={formData.role}
                        onChange={(e) =>
                          setFormData({ ...formData, role: e.target.value })
                        }
                      />
                      {formErrors.role && (
                        <span className="text-danger">{formErrors.role}</span>
                      )}
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                        onClick={resetFormData}
                      >
                        Cancelar
                      </button>
                      <button type="submit" className="btn btn-submit">
                        Guardar
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Add Role */}
    </div>
  );
};

export default AddRole;
