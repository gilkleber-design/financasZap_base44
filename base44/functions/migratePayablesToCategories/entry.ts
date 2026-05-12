import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Buscar ou criar categoria "Empregada Doméstica"
    let categories = await base44.entities.Category.list('name', 100);
    let empregadaCat = categories.find(c => c.slug === 'empregada_domestica' && !c.parent_id);
    
    if (!empregadaCat) {
      empregadaCat = await base44.entities.Category.create({
        name: 'Empregada Doméstica',
        slug: 'empregada_domestica',
        parent_id: null,
        color: '#ec4899',
        active: true,
      });
    }

    // Criar subcategorias
    const subCategoriesData = [
      { name: 'Salário', slug: 'salario_domestica', color: '#f59e0b' },
      { name: 'Encargos Sociais', slug: 'encargos_domestica', color: '#f87171' },
    ];

    const subCategories = {};
    for (const subData of subCategoriesData) {
      let subCat = categories.find(c => c.slug === subData.slug);
      if (!subCat) {
        subCat = await base44.entities.Category.create({
          name: subData.name,
          slug: subData.slug,
          parent_id: empregadaCat.id,
          color: subData.color,
          active: true,
        });
      }
      subCategories[subData.slug] = subCat;
    }

    // Remapear payables que têm category='salario_clt' ou 'servicos' com descrição contendo "salário" ou "encargo"
    const payables = await base44.entities.Payable.list('-due_date', 1000);
    let updated = 0;

    for (const payable of payables) {
      let shouldUpdate = false;
      let newCategoryId = null;

      // Detectar padrão para "Salário da Empregada"
      if ((payable.category === 'salario_clt' || payable.category === 'servicos') &&
          payable.description && payable.description.toLowerCase().includes('salário')) {
        newCategoryId = subCategories['salario_domestica'].id;
        shouldUpdate = true;
      }

      // Detectar padrão para "Encargos Sociais"
      if ((payable.category === 'servicos' || payable.category === 'impostos') &&
          payable.description && 
          (payable.description.toLowerCase().includes('encargo') || 
           payable.description.toLowerCase().includes('inss') ||
           payable.description.toLowerCase().includes('fgts'))) {
        newCategoryId = subCategories['encargos_domestica'].id;
        shouldUpdate = true;
      }

      if (shouldUpdate && newCategoryId) {
        await base44.entities.Payable.update(payable.id, {
          category_id: newCategoryId,
        });
        updated++;
      }
    }

    return Response.json({
      message: 'Migração concluída',
      empregadaCategoryId: empregadaCat.id,
      subCategories: Object.keys(subCategories).map(k => ({ slug: k, id: subCategories[k].id })),
      payablesUpdated: updated,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});