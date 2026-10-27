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

            // 1. Global Admin & Idareci have access to boarding administrative modules
            if (user.IsInRole("Admin") || user.IsInRole("Idareci"))
            {
                await next();
                return;
            }

            // 2. PansiyonGorevlisi and PansiyonNobetcisi have access to boarding modules
            if (user.IsInRole("PansiyonGorevlisi") || user.IsInRole("PansiyonNobetcisi"))
            {
                await next();
                return;
            }

            context.Result = new ForbidResult();
        }
    }
}
