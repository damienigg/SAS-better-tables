// Copyright © 2023, SAS Institute Inc., Cary, NC, USA.  All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0
// Modifications © 2026 Damien Iggiotti — switched the sort model type to a
// local definition that does not depend on ag-grid.

import { SortModel, TableQuery } from "./types";

class PaginatedResultSet<T> {
  constructor(
    protected readonly queryForData: PaginatedResultSet<T>["getData"],
  ) {}

  public async getData(
    start: number,
    end: number,
    sortModel: SortModel[],
    query: TableQuery | undefined,
  ): Promise<T> {
    return await this.queryForData(start, end, sortModel, query);
  }
}

export default PaginatedResultSet;
