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

    // Buscar TODAS as categorias novamente para mapear completo
    categories = await base44.entities.Category.list('name', 200);
    const categoryMap = {};
    categories.forEach(c => {
      if (c.slug) categoryMap[c.slug] = c.id;
    });

    // Buscar payables com descrições que indicam subcategorias
    const payables = await base44.entities.Payable.list('-due_date', 1000);
    let updated = 0;

    for (const payable of payables) {
      let shouldUpdate = false;
      let newCategoryId = null;
      const desc = (payable.description || '').toLowerCase();

      // Padrão: Salário Empregada Doméstica
      if (desc.includes('salário') && (desc.includes('empregada') || desc.includes('doméstica'))) {
        newCategoryId = subCategories['salario_domestica'].id;
        shouldUpdate = true;
      } else if (desc.includes('salário') && !desc.includes('clt') && !desc.includes('empresa')) {
        // Fallback: "salário" que não é CLT (assume ser empregada doméstica)
        newCategoryId = subCategories['salario_domestica'].id;
        shouldUpdate = true;
      }

      // Padrão: Encargos/INSS/FGTS de Empregada Doméstica
      if (!shouldUpdate && (desc.includes('encargo') || 
          (desc.includes('inss') && (desc.includes('empregada') || desc.includes('doméstica'))) ||
          (desc.includes('fgts') && (desc.includes('empregada') || desc.includes('doméstica'))) ||
          desc.includes('darf'))) {
        newCategoryId = subCategories['encargos_domestica'].id;
        shouldUpdate = true;
      }

      // Padrão: Extra / Diária
      if (!shouldUpdate && (desc.includes('extra') || desc.includes('diária') || desc.includes('diaria'))) {
        const extraCat = categoryMap['extra_diaria'];
        if (extraCat) {
          newCategoryId = extraCat;
          shouldUpdate = true;
        }
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