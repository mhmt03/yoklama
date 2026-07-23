using System;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.EntityFrameworkCore;
using yoklamaWeb.Data;

namespace yoklamaWeb.Filters
{
    public class PansiyonAdminAuthorizeAttribute : TypeFilterAttribute
    {
        public PansiyonAdminAuthorizeAttribute() : base(typeof(PansiyonAdminAuthorizeFilter))
        {
        }
    }

    public class PansiyonAdminAuthorizeFilter : IAsyncActionFilter
    {
        private readonly AppDbContext _context;

        public PansiyonAdminAuthorizeFilter(AppDbContext context)
        {
            _context = context;
        }

        public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
        {
            var user = context.HttpContext.User;
            if (user == null || user.Identity == null || !user.Identity.IsAuthenticated)
            {
                context.Result = new ChallengeResult();
                return;
            }

            // 1. Global Admin (Identity Role: Admin) has access to everything
            if (user.IsInRole("Admin"))
            {
                await next();
                return;
            }

            // 2. PansiyonGorevlisi with database Rol == "Admin" has access to boarding administrative modules
            if (user.IsInRole("PansiyonGorevlisi"))
            {
                var username = user.Identity.Name;
                if (!string.IsNullOrEmpty(username))
                {
                    var gorevli = await _context.PansiyonGorevlileri
                        .FirstOrDefaultAsync(g => g.KullaniciAdi == username && g.Aktif);

                    if (gorevli != null && gorevli.Rol == "Admin")
                    {
                        await next();
                        return;
                    }
                }
            }

            context.Result = new ForbidResult();
        }
    }
}
