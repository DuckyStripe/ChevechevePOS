import React, { useState, useEffect } from "react";
import PropTypes from "prop-types"; //
import Select from "react-select";
import { fetchCategories } from "../../Data/Inventario/category"; // I

const EditSubcategories = ({ SubcategoryData }) => {
  const [categoryName, setCategoryName] = useState("");
  const [subcategoryName, setSubCategoryName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState(true);
  const [categories, setCategories] = useState([]); // Para almacenar la lista de categorías

  useEffect(() => {
    const loadInitialData = async () => {
      const products = await fetchCategories(); // Cargar por defecto los productos con bajo inventario
      setCategories(products);
    };

    loadInitialData();
  }, []);

  useEffect(() => {
    if (SubcategoryData) {
      setCategoryName(SubcategoryData.category || "");
      setSubCategoryName(SubcategoryData.subcategory || "");
      setDescription(SubcategoryData.categoryslug || ""); // Asegúrate de asignar al campo correcto
      setStatus(SubcategoryData.status === "Active");
    }
  }, [SubcategoryData]);
  const handleUpdateCategory = () => {
    // Aquí manejarías la lógica para actualizar la categoría
    // Podrías hacer una llamada a una API o actualizar el estado global, según sea el caso
    console.log("Updated Category:", {
      categoryName,
      description,
      status: status ? "Active" : "Inactive"
    });

    // Asegúrate de cerrar el modal después de actualizar los datos, si es apropiado
    // Por ejemplo, podrías utilizar un método para cerrar el modal de Bootstrap manualmente o vía React
  };

  return (
    <div>
      {/* Edit Category */}
      <div className="modal fade" id="edit-category">
        <div className="modal-dialog modal-dialog-centered custom-modal-two">
          <div className="modal-content">
            <div className="page-wrapper-new p-0">
              <div className="content">
                <div className="modal-header border-0 custom-modal-header">
                  <div className="page-title">
                    <h4>Editar Subcategoria</h4>
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
                      <label className="form-label">Categoria Padre</label>
                      <Select
                        options={categories}
                        value={categories.find((c) => c.label === categoryName)}
                        onChange={(selectedOption) =>
                          setCategoryName(selectedOption.label)
                        }
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Category Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={subcategoryName}
                        onChange={(e) => setSubCategoryName(e.target.value)}
                      />
                    </div>
                    <div className="mb-3 input-blocks">
                      <label className="form-label">Description</label>
                      <textarea
                        type="text"
                        className="form-control"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                      />
                    </div>
                    <div className="mb-0">
                      <div className="status-toggle modal-status d-flex justify-content-between align-items-center">
                        <span className="status-label">Status</span>
                        <input
                          type="checkbox"
                          id="user2"
                          className="check"
                          checked={status}
                          onChange={(e) => setStatus(e.target.checked)}
                        />
                        <label htmlFor="user3" className="checktoggle" />
                      </div>
                    </div>
                    <div className="modal-footer-btn">
                      <button
                        type="button"
                        className="btn btn-cancel me-2"
                        data-bs-dismiss="modal"
                      >
                        Cancel
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
      {/* /Edit Category */}
    </div>
  );
};
EditSubcategories.propTypes = {
  SubcategoryData: PropTypes.shape({
    category: PropTypes.string.isRequired,
    subcategory: PropTypes.string.isRequired,
    categoryslug: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired
  })
};
export default EditSubcategories;
