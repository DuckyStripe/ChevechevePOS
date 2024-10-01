import React, { useState } from "react";
import { Link } from "react-router-dom";
// import { all_routes } from "../../../Router/all_routes";

const AddInventory = () => {
  const [quantity, setQuantity] = useState("");
  const [operation, setOperation] = useState("add"); // Estado para manejar si se agrega o se quita inventario
  // const route = all_routes;

  const handleQuantityChange = (e) => {
    setQuantity(e.target.value);
  };

  const handleOperationChange = (e) => {
    setOperation(e.target.value);
  };

  const handleSubmit = () => {
    // Aquí podrías manejar la lógica para agregar o quitar del inventario
    // según el valor de 'operation' y 'quantity'.
    console.log(`Operation: ${operation}, Quantity: ${quantity}`);
    // Implementa la lógica para actualizar el inventario
  };

  return (
    <>
      {/* Add or Remove Inventory */}
      <div className="modal fade" id="add-units-category">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Añadir o Quitar Inventario</h4>
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
                  <div className="mb-3">
                    <label className="form-label">Cantidad</label>
                    <input
                      type="number"
                      className="form-control"
                      value={quantity}
                      onChange={handleQuantityChange}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Operación</label>
                    <select
                      className="form-control"
                      value={operation}
                      onChange={handleOperationChange}
                    >
                      <option value="add">Añadir</option>
                      <option value="remove">Quitar</option>
                    </select>
                  </div>
                  <div className="modal-footer-btn">
                    <Link
                      to="#"
                      className="btn btn-cancel me-2"
                      data-bs-dismiss="modal"
                    >
                      Cancelar
                    </Link>
                    <button
                      className="btn btn-submit"
                      onClick={handleSubmit}
                      data-bs-dismiss="modal"
                    >
                      Enviar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* /Add or Remove Inventory */}
    </>
  );
};

export default AddInventory;
