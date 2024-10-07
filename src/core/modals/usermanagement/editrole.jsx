import React, { useState, useEffect } from "react";
import PropTypes from "prop-types"; // Importa PropTypes
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const EditRole = ({ RolData }) => {
  const [formErrors, setFormErrors] = useState({});
  const [, setidRolstate] = useState("");//idRolstate
  const [NombreRol, setNombreRol] = useState("");
  const [formData, setFormData] = useState({
    id: "",
    nombre_rol: ""
  });

  useEffect(() => {
    if (RolData) {
      setidRolstate(RolData.id || "");
      setNombreRol(RolData.nombre_rol || "");
      setFormData({
        id: RolData.id || "",
        nombre_rol: RolData.nombre_rol || ""
      });
    }
  }, [RolData]);

  const resetFormData = () => {
    setFormData({
      id: "",
      nombre_rol: ""
    });
    setFormErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (validateForm()) {
      try {
        toast.success("Rol modificado exitosamente");
        
        resetFormData();

        // Simula un clic en el botón de cancelar para cerrar el modal
        document.querySelector(".btn-cancel").click();
      } catch (error) {
        console.error("Error al enviar datos: ", error);
        toast.error("Error al agregar el rol");
      }
    }
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.id) {
      errors.id = "El id es obligatorio";
    }

    if (!formData.nombre_rol) {
      errors.nombre_rol = "El nombre es obligatorio";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleNombreRolChange = (e) => {
    const newRolename = e.target.value;
    setNombreRol(newRolename);
    setFormData((prevState) => ({
      ...prevState,
      nombre_rol: newRolename
    }));
  };

  return (
    <div>
      <ToastContainer />
      <div className="modal fade" id="edit-units">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Editar Rol</h4>
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
                        value={NombreRol}
                        onChange={handleNombreRolChange}
                      />
                      {formErrors.rolename && (
                        <span className="text-danger">
                          {formErrors.rolename}
                        </span>
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
                      <button
                        type="submit"
                        className="btn btn-submit"
                        data-bs-dismiss="modal" // Agrega este atributo
                      >
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
    </div>
  );
};

EditRole.propTypes = {
  RolData: PropTypes.shape({
    id: PropTypes.number.isRequired,
    nombre_rol: PropTypes.string.isRequired
  })
};
export default EditRole;
